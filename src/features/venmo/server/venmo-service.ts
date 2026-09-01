import { ulid } from "ulid";

import {
    VENMO_INTEGRATION_ID,
    createVenmoActivityId,
    createVenmoExternalAccountKey,
    normalizeVenmoInstitution,
    venmoFinancialDetailsEqual,
    type VenmoParsedActivity,
} from "@/features/venmo/models/venmo-activity";
import { mergeTransactionsWithWorkspaceChanges } from "@/features/transactions/server/transaction-mutation-service";
import { upsertTransactionWithWorkspaceChanges } from "@/features/transactions/server/transaction-save-service";
import { listTransactionChildren } from "@/features/transactions/server/transaction-child-service";
import { findTransactionAutoMatches } from "@/features/transactions/models/transaction-auto-match";
import {
    toVenmoActivityRecord,
    venmoTransactionImporter,
    type VenmoActivityRecord,
} from "@/features/transaction-importers/models/venmo-transaction-importer";
import {
    deleteTransactionImportActivity,
    listTransactionImportActivities,
    synchronizeTransactionImportActivity,
} from "@/features/transaction-importers/server/transaction-import-activity-service";
import { findStoredTransaction } from "@/features/transactions/server/transaction-query-service";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { createWorkspaceDeleteChange, createWorkspaceUpsertChange } from "@/features/workspace/server/workspace-change-builder";
import type {
    WorkspaceAccountRecord,
    WorkspaceTransactionRecord,
    WorkspaceVenmoAccountMappingRecord,
    WorkspaceVenmoIntegrationRecord,
} from "@/lib/workspace/sync-types";
import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";

function inboundRecipient() {
    const recipient = process.env.VENMO_EMAIL_RECIPIENT?.trim().toLowerCase();
    if (!recipient) {
        throw new HttpError(
            503,
            "venmo_inbox_not_configured",
            "Venmo email ingestion is not configured for this deployment.",
        );
    }

    return recipient;
}

async function listAccounts(ledgerId: string) {
    return queryAllPages(getBudgetedSchema().entities.accounts.query.byAccount({ ledgerId }), { consistent: true }) as Promise<WorkspaceAccountRecord[]>;
}

export async function listVenmoIntegrations(ledgerId: string) {
    return queryAllPages(getBudgetedSchema().entities.venmoIntegrations.query.byIntegration({ ledgerId }), { consistent: true }) as Promise<WorkspaceVenmoIntegrationRecord[]>;
}

export async function getVenmoIntegration(ledgerId: string) {
    return (await listVenmoIntegrations(ledgerId)).find((record) => record.integrationId === VENMO_INTEGRATION_ID);
}

export async function listVenmoAccountMappings(ledgerId: string) {
    return queryAllPages(getBudgetedSchema().entities.venmoAccountMappings.query.byMapping({ ledgerId }), { consistent: true }) as Promise<WorkspaceVenmoAccountMappingRecord[]>;
}

export async function listVenmoActivities(ledgerId: string) {
    return (await listTransactionImportActivities(ledgerId))
        .filter((activity) => activity.provider === "venmo")
        .map(toVenmoActivityRecord);
}

export async function saveVenmoSettings(input: { inboxEnabled: boolean; ledgerId: string; venmoAccountId: string }) {
    const [accounts, existing] = await Promise.all([listAccounts(input.ledgerId), getVenmoIntegration(input.ledgerId)]);
    const account = accounts.find((candidate) => candidate.accountId === input.venmoAccountId);
    if (!account) throw new HttpError(404, "account_missing", "The Venmo balance account is missing.");
    if (!(["cash", "checking", "savings"] as const).includes(account.accountType as "cash" | "checking" | "savings") || account.plaidAccountLinkId) {
        throw new HttpError(422, "venmo_account_invalid", "Choose a non-Plaid cash, checking, or savings account for the Venmo balance.");
    }

    const recipient = inboundRecipient();
    if (input.inboxEnabled) {
        const owners = await queryAllPages(getBudgetedSchema().entities.venmoIntegrations.query.byRecipient({ inboundRecipient: recipient })) as WorkspaceVenmoIntegrationRecord[];
        if (owners.some((owner) => owner.inboxEnabled && owner.ledgerId !== input.ledgerId)) {
            throw new HttpError(409, "venmo_inbox_owned", "The Venmo inbox is already assigned to another ledger.");
        }
    }

    const now = new Date().toISOString();
    const integration: WorkspaceVenmoIntegrationRecord = {
        createdAt: existing?.createdAt ?? now,
        inboundRecipient: recipient,
        inboxEnabled: input.inboxEnabled,
        integrationId: VENMO_INTEGRATION_ID,
        latestProcessingStatus: existing?.latestProcessingStatus ?? "never",
        ledgerId: input.ledgerId,
        updatedAt: now,
        venmoAccountId: account.accountId,
        ...(existing?.latestProcessingAt ? { latestProcessingAt: existing.latestProcessingAt } : {}),
        ...(existing?.lastError ? { lastError: existing.lastError } : {}),
    };
    await getBudgetedSchema().entities.venmoIntegrations.put(integration).go();
    return {
        integration,
        workspaceChanges: [createWorkspaceUpsertChange({ entityId: integration.integrationId, entityType: "venmoIntegration", previousRecord: existing ?? null, record: integration })],
    };
}

function parseExternalAccountKey(value: string) {
    const splitAt = value.lastIndexOf(":");
    const institution = value.slice(0, splitAt).trim();
    const last4 = value.slice(splitAt + 1).trim();
    if (!institution || !/^\d{4}$/.test(last4)) throw new HttpError(422, "venmo_external_account_invalid", "External accounts require an institution and four-digit account suffix.");
    return { institution, last4 };
}

export async function saveVenmoAccountMapping(input: { accountId: string; externalAccountKey: string; ledgerId: string }) {
    const normalized = parseExternalAccountKey(input.externalAccountKey);
    const externalAccountKey = createVenmoExternalAccountKey(normalized);
    const [accounts, mappings] = await Promise.all([listAccounts(input.ledgerId), listVenmoAccountMappings(input.ledgerId)]);
    const account = accounts.find((candidate) => candidate.accountId === input.accountId);
    if (!account || !["cash", "checking", "savings", "creditCard"].includes(account.accountType)) throw new HttpError(422, "venmo_mapping_account_invalid", "Choose an existing cash, checking, savings, or credit card account.");
    const existing = mappings.find((mapping) => mapping.externalAccountKey === externalAccountKey);
    const now = new Date().toISOString();
    const mapping: WorkspaceVenmoAccountMappingRecord = {
        accountId: account.accountId,
        createdAt: existing?.createdAt ?? now,
        externalAccountKey,
        institution: normalized.institution,
        last4: normalized.last4,
        ledgerId: input.ledgerId,
        mappingId: existing?.mappingId ?? ulid(),
        updatedAt: now,
    };
    await getBudgetedSchema().entities.venmoAccountMappings.put(mapping).go();
    const retry = await reconcileVenmoActivities(input.ledgerId);
    return {
        mapping,
        workspaceChanges: [createWorkspaceUpsertChange({ entityId: mapping.mappingId, entityType: "venmoAccountMapping", previousRecord: existing ?? null, record: mapping }), ...retry.workspaceChanges],
    };
}

export async function deleteVenmoAccountMapping(input: { ledgerId: string; mappingId: string }) {
    const mapping = (await listVenmoAccountMappings(input.ledgerId)).find((candidate) => candidate.mappingId === input.mappingId);
    if (!mapping) throw new HttpError(404, "venmo_mapping_missing", "The Venmo account mapping is missing.");
    await getBudgetedSchema().entities.venmoAccountMappings.delete({ ledgerId: input.ledgerId, mappingId: input.mappingId }).go();
    return { workspaceChanges: [createWorkspaceDeleteChange({ entityId: mapping.mappingId, entityType: "venmoAccountMapping", previousRecord: mapping })] };
}

export async function deleteVenmoActivity(input: {
    activityId: string;
    ledgerId: string;
}) {
    const storedActivities = await listTransactionImportActivities(input.ledgerId);
    const storedActivity = storedActivities.find((candidate) => {
        if (candidate.provider !== "venmo") return false;

        return toVenmoActivityRecord(candidate).activityId === input.activityId;
    });

    if (!storedActivity) {
        throw new HttpError(
            404,
            "venmo_activity_missing",
            "The Venmo activity could not be found.",
        );
    }

    if (storedActivity.linkedTransactionId) {
        const linkedTransaction = await findStoredTransaction(
            input.ledgerId,
            storedActivity.linkedTransactionId,
        );

        if (linkedTransaction) {
            throw new HttpError(
                409,
                "venmo_activity_linked",
                "Delete the linked transaction before removing this Venmo activity.",
            );
        }
    }

    return deleteTransactionImportActivity({
        activityId: storedActivity.activityId,
        ledgerId: input.ledgerId,
    });
}

async function resolveExternalAccount(input: { institution?: string; last4?: string; ledgerId: string }) {
    if (!input.institution || !input.last4) return undefined;
    const key = createVenmoExternalAccountKey({ institution: input.institution, last4: input.last4 });
    const [mappings, accounts] = await Promise.all([listVenmoAccountMappings(input.ledgerId), listAccounts(input.ledgerId)]);
    const explicit = mappings.find((mapping) => mapping.externalAccountKey === key);
    if (explicit) return accounts.find((account) => account.accountId === explicit.accountId);
    const institution = normalizeVenmoInstitution(input.institution);
    const exact = accounts.filter((account) => account.plaidAccountMask === input.last4 && normalizeVenmoInstitution(account.plaidInstitutionName ?? "") === institution);
    return exact.length === 1 ? exact[0] : undefined;
}

function toActivityRecord(input: { existing?: VenmoActivityRecord; ledgerId: string; messageId: string; parsed: VenmoParsedActivity; sourceSubject: string; status: VenmoActivityRecord["matchStatus"]; transactionId?: string; error?: string }) {
    const now = new Date().toISOString();
    return {
        ...input.parsed,
        activityId: input.existing?.activityId ?? createVenmoActivityId(input.parsed),
        firstReceivedAt: input.existing?.firstReceivedAt ?? now,
        lastReceivedAt: now,
        ledgerId: input.ledgerId,
        linkedTransactionId: input.transactionId,
        matchStatus: input.status,
        processingError: input.error,
        sourceMessageId: input.messageId,
        sourceSubject: input.sourceSubject,
        updatedAt: now,
    } satisfies VenmoActivityRecord;
}

function isVenmoBalanceFunding(method?: string) {
    return /^venmo(?: account)? balance$/i.test(method?.trim() ?? "");
}

async function putVenmoActivity(activity: VenmoActivityRecord) {
    return synchronizeTransactionImportActivity(
        venmoTransactionImporter.normalize(activity),
    );
}

export async function ingestVenmoActivity(input: { ledgerId: string; messageId: string; parsed: VenmoParsedActivity; sourceSubject: string }) {
    const integration = await getVenmoIntegration(input.ledgerId);
    if (!integration?.inboxEnabled || !integration.venmoAccountId) throw new HttpError(409, "venmo_inbox_disabled", "The Venmo inbox is not enabled for this ledger.");
    const activityId = createVenmoActivityId(input.parsed);
    const existing = (await listVenmoActivities(input.ledgerId)).find(
        (activity) => activity.providerTransactionId === input.parsed.providerTransactionId,
    );
    if (existing) {
        if (!venmoFinancialDetailsEqual(existing, input.parsed)) {
            const conflict = toActivityRecord({ ...input, existing, status: "error", error: "Venmo redelivered this provider transaction ID with changed financial details." });
            await putVenmoActivity(conflict);
            throw new HttpError(409, "venmo_activity_changed", conflict.processingError!);
        }
        if (existing.matchStatus !== "needsAccount") {
            const canonical = await synchronizeTransactionImportActivity(
                venmoTransactionImporter.normalize(existing),
            );
            return { activity: existing, duplicate: true, workspaceChanges: canonical.workspaceChanges };
        }
    }

    const external = input.parsed.kind === "standardTransfer"
        ? await resolveExternalAccount({ institution: input.parsed.destinationInstitution, last4: input.parsed.destinationLast4, ledgerId: input.ledgerId })
        : input.parsed.kind === "paymentSent" && !isVenmoBalanceFunding(input.parsed.fundingMethod)
          ? await resolveExternalAccount({ institution: input.parsed.fundingInstitution, last4: input.parsed.fundingLast4, ledgerId: input.ledgerId })
          : undefined;
    const accountId = input.parsed.kind === "paymentReceived" || (input.parsed.kind === "paymentSent" && isVenmoBalanceFunding(input.parsed.fundingMethod))
        ? integration.venmoAccountId
        : external?.accountId;

    if (!accountId) {
        if (existing) {
            return { activity: existing, duplicate: true, workspaceChanges: [] as WorkspaceMutationChangeInput[] };
        }
        const activity = toActivityRecord({ ...input, status: "needsAccount" });
        const canonical = await putVenmoActivity(activity);
        return { activity, duplicate: false, workspaceChanges: canonical.workspaceChanges };
    }

    if (input.parsed.kind === "standardTransfer" && external && !["checking", "savings"].includes(external.accountType)) {
        const activity = toActivityRecord({ ...input, status: "needsAccount", error: "Standard transfers require a checking or savings destination." });
        const canonical = await putVenmoActivity(activity);
        return { activity, duplicate: false, workspaceChanges: canonical.workspaceChanges };
    }

    const transactionId = `venmo:${activityId}`;
    const line = input.parsed.kind === "paymentReceived"
        ? { amountCents: input.parsed.amountCents, toAccountId: integration.venmoAccountId }
        : input.parsed.kind === "standardTransfer"
          ? { amountCents: input.parsed.amountCents, fromAccountId: integration.venmoAccountId, toAccountId: accountId }
          : { amountCents: input.parsed.amountCents, fromAccountId: accountId };
    const transactionResult = await upsertTransactionWithWorkspaceChanges(input.ledgerId, {
        accountId,
        allowCreateWithTransactionId: true,
        audit: { action: "importOrSync", source: "venmoEmail" },
        lines: [line],
        kind: "standard",
        memo: input.parsed.memo,
        occurredAt: input.parsed.occurredDate,
        payee: input.parsed.counterpartyName ?? (input.parsed.kind === "standardTransfer" ? "Venmo transfer" : "Venmo"),
        source: "venmo",
        transactionId,
    });
    const awaitsPlaid = Boolean(external?.plaidAccountLinkId) && (input.parsed.kind === "standardTransfer" || input.parsed.kind === "paymentSent");
    const activity = toActivityRecord({ ...input, existing, status: awaitsPlaid ? "unmatched" : "posted", transactionId });
    const canonical = await putVenmoActivity(activity);
    return { activity, duplicate: false, workspaceChanges: [...transactionResult.workspaceChanges, ...canonical.workspaceChanges] };
}

function offsetDate(date: string, days: number) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

async function attachTransactionChildren(
    ledgerId: string,
    records: WorkspaceTransactionRecord[],
) {
    const transactions: Array<
        WorkspaceTransactionRecord &
            Awaited<ReturnType<typeof listTransactionChildren>>
    > = [];

    for (let index = 0; index < records.length; index += 10) {
        const chunk = records.slice(index, index + 10);
        transactions.push(
            ...(await Promise.all(
                chunk.map(async (transaction) => ({
                    ...transaction,
                    ...(await listTransactionChildren(
                        ledgerId,
                        transaction.transactionId,
                    )),
                })),
            )),
        );
    }

    return transactions;
}

async function listTransactionsForVenmoMatching(
    ledgerId: string,
    activities: VenmoActivityRecord[],
) {
    const dates = [...new Set(activities.map((activity) => activity.occurredDate))];
    const pages = await Promise.all(
        dates.map((date) =>
            queryAllPages(
                getBudgetedSchema().entities.transactions.query
                    .byTransaction({ ledgerId })
                    .between(
                        {
                            occurredAt: `${offsetDate(date, -venmoTransactionImporter.matchingPolicy.dateWindowDays)}T00:00:00.000Z`,
                            transactionId: "",
                        },
                        {
                            occurredAt: `${offsetDate(date, venmoTransactionImporter.matchingPolicy.dateWindowDays)}T00:00:00.000Z`,
                            transactionId: "\uffff",
                        },
                    ),
                { consistent: true },
            ) as Promise<WorkspaceTransactionRecord[]>,
        ),
    );
    const records = [
        ...new Map(
            pages.flat().map((transaction) => [
                transaction.transactionId,
                transaction,
            ]),
        ).values(),
    ];
    return attachTransactionChildren(ledgerId, records);
}

export async function reconcileVenmoActivities(ledgerId: string) {
    const workspaceChanges: WorkspaceMutationChangeInput[] = [];
    const pendingAccountActivities = (await listVenmoActivities(ledgerId)).filter((activity) => activity.matchStatus === "needsAccount");
    for (const activity of pendingAccountActivities) {
        const retried = await ingestVenmoActivity({
            ledgerId,
            messageId: activity.sourceMessageId,
            parsed: activity,
            sourceSubject: activity.sourceSubject,
        });
        workspaceChanges.push(...retried.workspaceChanges);
    }
    const activities = await listVenmoActivities(ledgerId);
    const matchableActivities = activities.filter(
        (activity) =>
            activity.matchStatus === "unmatched" ||
            activity.matchStatus === "conflict",
    );
    const [accounts, transactions] = await Promise.all([
        listAccounts(ledgerId),
        listTransactionsForVenmoMatching(ledgerId, matchableActivities),
    ]);
    for (const current of matchableActivities) {
        if (!current.linkedTransactionId) continue;
        const source = transactions.find((transaction) => transaction.transactionId === current.linkedTransactionId);
        if (!source) continue;
        const matches = findTransactionAutoMatches({ accounts, transactions: [source, ...transactions.filter((transaction) => transaction.transactionId !== source.transactionId)] });
        const pairs = [...matches.readyPairs, ...matches.ambiguousPairs].filter((pair) => pair.left.transactionId === source.transactionId || pair.right.transactionId === source.transactionId);
        const plaidCandidates = [...new Set(pairs.flatMap((pair) => [pair.left, pair.right]).filter((transaction) => transaction.transactionId !== source.transactionId && transaction.source === "plaid").map((transaction) => transaction.transactionId))];
        if (plaidCandidates.length === 1) {
            const pair = pairs.find((candidate) => [candidate.left.transactionId, candidate.right.transactionId].includes(plaidCandidates[0]!));
            const merged = await mergeTransactionsWithWorkspaceChanges(ledgerId, [source.transactionId, plaidCandidates[0]!], { source: "venmoEmail" }, undefined, pair?.matchType);
            const next = { ...current, candidateTransactionIdsJson: undefined, linkedTransactionId: merged.transaction.transactionId, matchStatus: "autoMatched" as const, updatedAt: new Date().toISOString() };
            const canonical = await putVenmoActivity(next);
            workspaceChanges.push(...merged.workspaceChanges, ...canonical.workspaceChanges);
        } else {
            const next = { ...current, candidateTransactionIdsJson: plaidCandidates.length ? JSON.stringify(plaidCandidates) : undefined, matchStatus: plaidCandidates.length ? "conflict" as const : "unmatched" as const, updatedAt: new Date().toISOString() };
            const canonical = await putVenmoActivity(next);
            workspaceChanges.push(...canonical.workspaceChanges);
        }
    }
    return { workspaceChanges };
}

export async function manuallyMatchVenmoActivity(input: { activityId: string; ledgerId: string; transactionId: string }) {
    const activity = (await listVenmoActivities(input.ledgerId)).find((candidate) => candidate.activityId === input.activityId);
    if (!activity?.linkedTransactionId) throw new HttpError(404, "venmo_activity_missing", "The Venmo activity is not linked to a transaction.");
    const candidates = JSON.parse(activity.candidateTransactionIdsJson ?? "[]") as string[];
    if (!candidates.includes(input.transactionId)) throw new HttpError(409, "venmo_match_stale", "The transaction is no longer a Venmo match candidate.");
    const merged = await mergeTransactionsWithWorkspaceChanges(input.ledgerId, [activity.linkedTransactionId, input.transactionId]);
    const next = { ...activity, candidateTransactionIdsJson: undefined, linkedTransactionId: merged.transaction.transactionId, matchStatus: "manualMatched" as const, updatedAt: new Date().toISOString() };
    const canonical = await putVenmoActivity(next);
    return { activity: next, workspaceChanges: [...merged.workspaceChanges, ...canonical.workspaceChanges] };
}
