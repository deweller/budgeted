import process from "node:process";
import { pathToFileURL } from "node:url";

import { DeleteCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import {
    amazonTransactionImporter,
    type AmazonPaymentRecord,
} from "@/features/transaction-importers/models/amazon-transaction-importer";
import {
    createTransactionImportActivityId,
    type TransactionImportActivityRecord,
} from "@/features/transaction-importers/models/transaction-importer-contract";
import {
    venmoTransactionImporter,
    type VenmoActivityRecord,
} from "@/features/transaction-importers/models/venmo-transaction-importer";
import { repairWorkspaceState } from "@/features/workspace/server/workspace-sync-service";
import { documentClient } from "@/lib/db/client";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { requireLedgerTableName } from "@/lib/db/resource";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";

const USAGE = [
    "Usage:",
    "  pnpm migrate:transaction-importers -- --stage production --ledger-id <ledgerId> --dry-run",
    "  pnpm migrate:transaction-importers -- --stage production --ledger-name <name> --dry-run",
    "  pnpm migrate:transaction-importers -- --stage production --ledger-id <ledgerId> --apply --confirm <ledgerId>",
    "",
    "The apply mode writes canonical importer activities, removes embedded transaction metadata,",
    "deletes the retired Amazon payment and Venmo activity items, and rebuilds workspace state.",
].join("\n");

type ParsedArgs = {
    apply: boolean;
    confirm?: string;
    help: boolean;
    json: boolean;
    ledgerId?: string;
    ledgerName?: string;
};

type LegacyAmazonMetadata = {
    providerRecordId: string;
};

type LegacyVenmoMetadata = {
    memo?: string;
    providerRecordId: string;
};

type RawItem = Record<string, unknown> & {
    __edb_e__?: string;
    ledgerId?: string;
    pk: string;
    sk: string;
};

function parseArgs(args: string[]): ParsedArgs {
    const parsed: ParsedArgs = { apply: false, help: false, json: false };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]!;
        if (arg === "--help" || arg === "-h") parsed.help = true;
        else if (arg === "--apply") parsed.apply = true;
        else if (arg === "--dry-run") parsed.apply = false;
        else if (arg === "--json") parsed.json = true;
        else if (arg === "--ledger-id") parsed.ledgerId = args[++index];
        else if (arg.startsWith("--ledger-id=")) parsed.ledgerId = arg.slice(12);
        else if (arg === "--ledger-name") parsed.ledgerName = args[++index];
        else if (arg.startsWith("--ledger-name=")) parsed.ledgerName = arg.slice(14);
        else if (arg === "--confirm") parsed.confirm = args[++index];
        else if (arg.startsWith("--confirm=")) parsed.confirm = arg.slice(10);
        else throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }

    return parsed;
}

async function resolveLedger(input: ParsedArgs) {
    if (Boolean(input.ledgerId) === Boolean(input.ledgerName)) {
        throw new Error(`Choose exactly one ledger selector.\n\n${USAGE}`);
    }
    if (input.ledgerId) {
        return { confirmationValue: input.ledgerId, ledgerId: input.ledgerId };
    }

    const ledgers = await queryAllPages(
        getBudgetedSchema().entities.ledgers.query.byLedger({
            workspaceId: GLOBAL_WORKSPACE_ID,
        }),
        { consistent: true },
    );
    const matches = ledgers.filter((ledger) => ledger.name === input.ledgerName);
    if (matches.length !== 1) {
        throw new Error(
            matches.length === 0
                ? `No ledger named "${input.ledgerName}" was found.`
                : `More than one ledger named "${input.ledgerName}" was found. Use --ledger-id.`,
        );
    }
    return { confirmationValue: input.ledgerName!, ledgerId: matches[0]!.ledgerId };
}

async function scanLegacyItems(ledgerId: string) {
    const items: RawItem[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
        const result = await documentClient.send(
            new ScanCommand({
                TableName: requireLedgerTableName(),
                ExclusiveStartKey: exclusiveStartKey,
                ExpressionAttributeNames: {
                    "#entity": "__edb_e__",
                    "#ledgerId": "ledgerId",
                },
                ExpressionAttributeValues: {
                    ":amazon": "amazonOrderPayment",
                    ":ledgerId": ledgerId,
                    ":transaction": "transaction",
                    ":venmo": "venmoActivity",
                },
                FilterExpression:
                    "#ledgerId = :ledgerId AND (#entity = :amazon OR #entity = :venmo OR #entity = :transaction)",
            }),
        );
        items.push(...((result.Items ?? []) as RawItem[]));
        exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return items;
}

function isLegacyAmazonPayment(item: RawItem): item is RawItem & AmazonPaymentRecord {
    return item.__edb_e__ === "amazonOrderPayment";
}

function isLegacyVenmoActivity(item: RawItem): item is RawItem & VenmoActivityRecord {
    return item.__edb_e__ === "venmoActivity";
}

function getLegacyTransactionMetadata(item: RawItem) {
    if (item.__edb_e__ !== "transaction") return null;
    const orderMetadata = item.orderMetadata as LegacyAmazonMetadata | undefined;
    const venmoMetadata = item.venmoMetadata as LegacyVenmoMetadata | undefined;
    return orderMetadata || venmoMetadata
        ? { item, orderMetadata, venmoMetadata }
        : null;
}

function financialDetailsMatch(
    existing: TransactionImportActivityRecord,
    next: TransactionImportActivityRecord,
) {
    return existing.financialFingerprint === next.financialFingerprint;
}

async function migrate(input: { apply: boolean; ledgerId: string }) {
    const [rawItems, existingActivities] = await Promise.all([
        scanLegacyItems(input.ledgerId),
        queryAllPages(
            getBudgetedSchema().entities.transactionImportActivities.query.byActivity({
                ledgerId: input.ledgerId,
            }),
            { consistent: true },
        ) as Promise<TransactionImportActivityRecord[]>,
    ]);
    const legacyItems = rawItems.filter(
        (item) =>
            item.__edb_e__ === "amazonOrderPayment" ||
            item.__edb_e__ === "venmoActivity",
    );
    const proposed = [
        ...legacyItems
            .filter(isLegacyAmazonPayment)
            .map((item) => amazonTransactionImporter.normalize(item)),
        ...legacyItems
            .filter(isLegacyVenmoActivity)
            .map((item) => venmoTransactionImporter.normalize(item)),
    ];
    const existingById = new Map(
        existingActivities.map((activity) => [activity.activityId, activity]),
    );
    const proposedById = new Map(proposed.map((activity) => [activity.activityId, activity]));
    const conflicts = proposed.flatMap((activity) => {
        const existing = existingById.get(activity.activityId);
        return existing && !financialDetailsMatch(existing, activity)
            ? [activity.activityId]
            : [];
    });
    const transactions = rawItems.flatMap((item) => {
        const metadata = getLegacyTransactionMetadata(item);
        return metadata ? [metadata] : [];
    });
    const missingSources = transactions.flatMap((transaction) =>
        [
            transaction.orderMetadata
                ? createTransactionImportActivityId(
                      "amazon",
                      transaction.orderMetadata.providerRecordId,
                  )
                : undefined,
            transaction.venmoMetadata
                ? createTransactionImportActivityId(
                      "venmo",
                      transaction.venmoMetadata.providerRecordId,
                  )
                : undefined,
        ].flatMap((activityId) =>
            activityId &&
            !proposedById.has(activityId) &&
            !existingById.has(activityId)
                ? [activityId]
                : [],
        ),
    );

    if (conflicts.length > 0 || missingSources.length > 0) {
        return {
            apply: false,
            conflicts,
            legacyAmazonPayments: legacyItems.filter(isLegacyAmazonPayment).length,
            legacyVenmoActivities: legacyItems.filter(isLegacyVenmoActivity).length,
            missingSources,
            proposedActivities: proposed.length,
            strippedTransactions: transactions.length,
        };
    }

    if (input.apply) {
        for (const activity of proposed) {
            if (!existingById.has(activity.activityId)) {
                await getBudgetedSchema().entities.transactionImportActivities
                    .put(activity)
                    .go();
            }
        }
        for (const transaction of transactions) {
            const memo = transaction.venmoMetadata?.memo?.trim();
            const shouldSetMemo =
                memo &&
                (typeof transaction.item.memo !== "string" ||
                    transaction.item.memo.trim().length === 0);
            await documentClient.send(
                new UpdateCommand({
                    TableName: requireLedgerTableName(),
                    Key: { pk: transaction.item.pk, sk: transaction.item.sk },
                    ExpressionAttributeNames: {
                        ...(shouldSetMemo ? { "#memo": "memo" } : {}),
                        "#orderMetadata": "orderMetadata",
                        "#updatedAt": "updatedAt",
                        "#venmoMetadata": "venmoMetadata",
                    },
                    ExpressionAttributeValues: {
                        ":updatedAt": new Date().toISOString(),
                        ...(shouldSetMemo ? { ":memo": memo } : {}),
                    },
                    UpdateExpression: `${
                        shouldSetMemo ? "SET #memo = :memo, #updatedAt = :updatedAt" : "SET #updatedAt = :updatedAt"
                    } REMOVE #orderMetadata, #venmoMetadata`,
                }),
            );
        }
        for (const item of legacyItems) {
            await documentClient.send(
                new DeleteCommand({
                    TableName: requireLedgerTableName(),
                    Key: { pk: item.pk, sk: item.sk },
                }),
            );
        }
        await repairWorkspaceState(input.ledgerId);
    }

    return {
        apply: input.apply,
        conflicts: [],
        legacyAmazonPayments: legacyItems.filter(isLegacyAmazonPayment).length,
        legacyVenmoActivities: legacyItems.filter(isLegacyVenmoActivity).length,
        missingSources: [],
        proposedActivities: proposed.length,
        strippedTransactions: transactions.length,
    };
}

async function main() {
    const input = parseArgs(process.argv.slice(2));
    if (input.help) {
        console.log(USAGE);
        return;
    }
    const ledger = await resolveLedger(input);
    if (input.apply && input.confirm !== ledger.confirmationValue) {
        throw new Error(`Confirmation must exactly match "${ledger.confirmationValue}".`);
    }
    const result = await migrate({ apply: input.apply, ledgerId: ledger.ledgerId });
    if (input.json) console.log(JSON.stringify(result, null, 2));
    else {
        console.log(`${result.apply ? "Applied" : "Dry run"} for ledger ${ledger.ledgerId}.`);
        console.log(
            `Canonical activities: ${result.proposedActivities}; legacy Amazon payments: ${result.legacyAmazonPayments}; legacy Venmo activities: ${result.legacyVenmoActivities}; transactions stripped: ${result.strippedTransactions}.`,
        );
        if (result.conflicts.length > 0)
            console.log(`Conflicting activities: ${result.conflicts.join(", ")}`);
        if (result.missingSources.length > 0)
            console.log(`Missing source activities: ${result.missingSources.join(", ")}`);
    }
    if (result.conflicts.length > 0 || result.missingSources.length > 0) {
        process.exitCode = 2;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    void main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
