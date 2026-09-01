import { ulid } from "ulid";

import {
    bumpLedgerWorkspaceGeneration,
    createLedger,
    deleteLedgerScopedRecords,
    listLedgers,
    updateLedger,
} from "@/features/ledgers/server/ledger-service";
import { writeLedgerScopedRecords } from "@/features/ledgers/server/ledger-scoped-record-writer-service";
import { deletePlaidTransactionSyncsForTransaction } from "@/features/plaid/server/plaid-transaction-sync-record-service";
import { parseTransactionTemplateLines } from "@/features/transaction-templates/models/transaction-template";
import { removeTransactionChildren } from "@/features/transactions/server/transaction-child-service";
import { inferTransactionReferenceCategoryId } from "@/features/transactions/models/reference-category";
import { HttpError } from "@/lib/api/errors";
import { groupBy } from "@/lib/collections";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import {
    LEDGER_EXPORT_FORMAT,
    LEDGER_EXPORT_PLAID_POLICY,
    LEDGER_EXPORT_VERSION,
    LEDGER_TRANSFER_RECORD_FAMILIES,
    countLedgerTransferRecords,
    selectLedgerTransferRecordsForImportScope,
    type LedgerExportAccountRecord,
    type LedgerExportFile,
    type LedgerExportTransactionRecord,
    type LedgerImportRequest,
    type LedgerImportSummary,
    type LedgerImportScope,
} from "@/features/utilities/models/ledger-transfer";
import { buildWorkspaceSnapshot } from "@/features/workspace/server/workspace-sync-service";
import type {
    WorkspaceAccountRecord,
    WorkspacePlaidAccountLinkRecord,
    WorkspaceSnapshot,
    WorkspaceSnapshotPayload,
    WorkspaceTransactionRecord,
    WorkspaceTransactionLineRecord,
} from "@/lib/workspace/sync-types";

type CurrentWorkspaceUser = {
    activeLedgerId: string;
    activeLedgerName: string;
    userId: string;
};

type LedgerTransferRecords = LedgerExportFile["records"];

const NON_PORTABLE_FIELD_NAMES = new Set([
    "accessToken",
    "secret",
    "syncCursor",
    "webhookUrl",
]);

function removeUndefined<TRecord extends Record<string, unknown>>(
    record: TRecord,
) {
    return Object.fromEntries(
        Object.entries(record).filter(
            ([key, value]) =>
                value !== undefined && !NON_PORTABLE_FIELD_NAMES.has(key),
        ),
    ) as TRecord;
}

function omitRecordFields<
    TRecord extends Record<string, unknown>,
    TField extends keyof TRecord,
>(record: TRecord, fields: TField[]) {
    const omittedFields = new Set<keyof TRecord>(fields);

    return Object.fromEntries(
        Object.entries(record).filter(
            ([key]) => !omittedFields.has(key as keyof TRecord),
        ),
    ) as Omit<TRecord, TField>;
}

function withLedgerId<TRecord extends { ledgerId: string }>(
    record: TRecord,
    ledgerId: string,
) {
    return {
        ...record,
        ledgerId,
    };
}

function remapLedgerScopedRecords<TRecord extends { ledgerId: string }>(
    records: TRecord[],
    ledgerId: string,
) {
    return records.map((record) => withLedgerId(record, ledgerId));
}

function toExportAccountRecord(
    account: WorkspaceAccountRecord,
): LedgerExportAccountRecord {
    return removeUndefined(omitRecordFields(account, ["balanceCents"]));
}

function toExportTransactionRecord(
    transaction: WorkspaceTransactionRecord,
) {
    return removeUndefined(
        omitRecordFields(transaction as WorkspaceTransactionRecord & {
            lines?: unknown;
            postings?: unknown;
        }, ["lines", "postings"]),
    );
}

function findActiveLedger(snapshot: WorkspaceSnapshot | WorkspaceSnapshotPayload) {
    const ledger = snapshot.ledgers.find(
        (candidate) => candidate.ledgerId === snapshot.activeLedgerId,
    );

    if (!ledger) {
        throw new HttpError(
            404,
            "ledger_missing",
            "The active ledger could not be found.",
        );
    }

    return ledger;
}

export async function buildLedgerExportFile(
    user: CurrentWorkspaceUser,
): Promise<LedgerExportFile> {
    const snapshot = await buildWorkspaceSnapshot(user);
    const activeLedger = findActiveLedger(snapshot);

    return {
        exportedAt: new Date().toISOString(),
        format: LEDGER_EXPORT_FORMAT,
        plaidPolicy: LEDGER_EXPORT_PLAID_POLICY,
        records: snapshotToTransferRecords(snapshot),
        sourceLedger: {
            createdAt: activeLedger.createdAt,
            ledgerId: activeLedger.ledgerId,
            name: activeLedger.name,
            updatedAt: activeLedger.updatedAt,
        },
        version: LEDGER_EXPORT_VERSION,
    };
}

function slugifyFilenameSegment(value: string) {
    return (
        value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "ledger"
    );
}

function formatExportFilenameTimestamp(value: string, timeZone: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error("The ledger export timestamp is invalid.");
    }

    const formatter = new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        second: "2-digit",
        timeZone,
        year: "numeric",
    });
    const parts = Object.fromEntries(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value]),
    );

    return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

function resolveExportFilenameTimeZone(timeZone: string | undefined) {
    if (!timeZone) {
        return "UTC";
    }

    try {
        new Intl.DateTimeFormat("en-US", { timeZone }).format();
        return timeZone;
    } catch {
        return "UTC";
    }
}

export function createLedgerExportFilename(
    exportFile: LedgerExportFile,
    timeZone?: string,
) {
    const timestamp = formatExportFilenameTimestamp(
        exportFile.exportedAt,
        resolveExportFilenameTimeZone(timeZone),
    );
    const ledgerName = slugifyFilenameSegment(exportFile.sourceLedger.name);

    return `budgeted-ledger-${ledgerName}-${timestamp}.json.gz`;
}

function assertNoDuplicateIds(input: {
    ids: string[];
    label: string;
}) {
    const seenIds = new Set<string>();

    for (const id of input.ids) {
        if (seenIds.has(id)) {
            throw new HttpError(
                422,
                "ledger_import_duplicate_id",
                `The import file contains a duplicate ${input.label} id.`,
            );
        }

        seenIds.add(id);
    }
}

function byId<TRecord>(
    records: TRecord[],
    getId: (record: TRecord) => string,
) {
    return new Map(records.map((record) => [getId(record), record]));
}

function overlayById<TRecord>(
    existing: TRecord[],
    imported: TRecord[],
    getId: (record: TRecord) => string,
) {
    const recordsById = byId(existing, getId);

    for (const record of imported) {
        recordsById.set(getId(record), record);
    }

    return Array.from(recordsById.values());
}

function getLedgerTransferRecordId(record: unknown, idKey: string) {
    const id = (record as Record<string, unknown>)[idKey];

    return String(id);
}

function getLedgerTransferRecordFamily(
    records: LedgerTransferRecords,
    key: keyof LedgerTransferRecords,
) {
    return records[key] as unknown[];
}

function assertKnownReference(input: {
    code: string;
    id: string | undefined;
    ids: Set<string>;
    message: string;
}) {
    if (input.id && !input.ids.has(input.id)) {
        throw new HttpError(422, input.code, input.message);
    }
}

function assertUniqueAccountNames(accounts: LedgerExportAccountRecord[]) {
    const accountIdByName = new Map<string, string>();

    for (const account of accounts) {
        const key = account.name.trim().toLowerCase();
        const existingAccountId = accountIdByName.get(key);

        if (existingAccountId && existingAccountId !== account.accountId) {
            throw new HttpError(
                409,
                "ledger_import_account_name_conflict",
                "The import would create duplicate account names.",
            );
        }

        accountIdByName.set(key, account.accountId);
    }
}

function assertNoDuplicateImportIds(records: LedgerTransferRecords) {
    for (const family of LEDGER_TRANSFER_RECORD_FAMILIES) {
        assertNoDuplicateIds({
            ids: getLedgerTransferRecordFamily(records, family.key).map(
                (record) => getLedgerTransferRecordId(record, family.idKey),
            ),
            label: family.singularLabel,
        });
    }
}

function validateLedgerTransferRecords(records: LedgerTransferRecords) {
    assertNoDuplicateImportIds(records);
    assertUniqueAccountNames(records.accounts);

    const accountIds = new Set(
        records.accounts.map((account) => account.accountId),
    );
    const accountLedgerAccountIds = new Set(
        records.accounts.map((account) => account.ledgerAccountId),
    );
    const allocationIds = new Set(
        records.budgetAllocations.map((allocation) => allocation.allocationId),
    );
    const categoryIds = new Set(
        records.budgetCategories.map((category) => category.categoryId),
    );
    const categoryLedgerAccountIds = new Set(
        records.budgetCategories.map((category) => category.ledgerAccountId),
    );
    const groupIds = new Set(records.budgetGroups.map((group) => group.groupId));
    const periodIds = new Set(
        records.budgetPeriods.map((period) => period.periodId),
    );
    const plaidAccountLinkIds = new Set(
        records.plaidAccountLinks.map((link) => link.plaidAccountLinkId),
    );
    const plaidTransactionSyncIds = new Set(
        records.plaidTransactionSyncs.map(
            (syncRecord) => syncRecord.plaidTransactionSyncId,
        ),
    );
    const transactionIds = new Set(
        records.transactions.map((transaction) => transaction.transactionId),
    );

    for (const category of records.budgetCategories) {
        assertKnownReference({
            code: "ledger_import_group_missing",
            id: category.groupId,
            ids: groupIds,
            message: "One or more imported categories reference a missing group.",
        });
    }

    for (const allocation of records.budgetAllocations) {
        assertKnownReference({
            code: "ledger_import_category_missing",
            id: allocation.categoryId,
            ids: categoryIds,
            message:
                "One or more imported allocations reference a missing category.",
        });
        assertKnownReference({
            code: "ledger_import_period_missing",
            id: allocation.periodId,
            ids: periodIds,
            message:
                "One or more imported allocations reference a missing budget period.",
        });
    }

    for (const fundingSource of records.allocationFundingSources) {
        assertKnownReference({
            code: "ledger_import_allocation_missing",
            id: fundingSource.allocationId,
            ids: allocationIds,
            message:
                "One or more imported funding sources reference a missing allocation.",
        });
        assertKnownReference({
            code: "ledger_import_category_missing",
            id: fundingSource.categoryId,
            ids: categoryIds,
            message:
                "One or more imported funding sources reference a missing category.",
        });
        assertKnownReference({
            code: "ledger_import_period_missing",
            id: fundingSource.periodId,
            ids: periodIds,
            message:
                "One or more imported funding sources reference a missing budget period.",
        });
        assertKnownReference({
            code: "ledger_import_funding_source_missing",
            id: fundingSource.sourceId,
            ids:
                fundingSource.sourceType === "account"
                    ? accountIds
                    : categoryIds,
            message:
                "One or more imported funding sources reference a missing source.",
        });
    }

    for (const transaction of records.transactions) {
        assertKnownReference({
            code: "ledger_import_account_missing",
            id: transaction.referenceAccountId,
            ids: accountIds,
            message:
                "One or more imported transactions reference a missing account.",
        });
        assertKnownReference({
            code: "ledger_import_category_missing",
            id: transaction.referenceCategoryId,
            ids: categoryIds,
            message:
                "One or more imported transactions reference a missing category.",
        });
        assertKnownReference({
            code: "ledger_import_period_missing",
            id: transaction.periodId,
            ids: periodIds,
            message:
                "One or more imported transactions reference a missing budget period.",
        });
        assertKnownReference({
            code: "ledger_import_plaid_sync_missing",
            id: transaction.plaidTransactionSyncId,
            ids: plaidTransactionSyncIds,
            message:
                "One or more imported transactions reference a missing Plaid sync record.",
        });
    }

    for (const line of records.transactionLines) {
        assertKnownReference({
            code: "ledger_import_transaction_missing",
            id: line.transactionId,
            ids: transactionIds,
            message:
                "One or more imported transaction lines reference a missing transaction.",
        });
        assertKnownReference({
            code: "ledger_import_category_missing",
            id: line.categoryId,
            ids: categoryIds,
            message:
                "One or more imported transaction lines reference a missing category.",
        });
        assertKnownReference({
            code: "ledger_import_account_missing",
            id: line.fromAccountId,
            ids: accountIds,
            message:
                "One or more imported transaction lines reference a missing source account.",
        });
        assertKnownReference({
            code: "ledger_import_account_missing",
            id: line.toAccountId,
            ids: accountIds,
            message:
                "One or more imported transaction lines reference a missing destination account.",
        });
    }

    for (const posting of records.ledgerPostings) {
        assertKnownReference({
            code: "ledger_import_transaction_missing",
            id: posting.transactionId,
            ids: transactionIds,
            message:
                "One or more imported ledger postings reference a missing transaction.",
        });

        if (posting.ledgerAccountKind === "financial") {
            assertKnownReference({
                code: "ledger_import_account_missing",
                id: posting.ledgerAccountId,
                ids: accountLedgerAccountIds,
                message:
                    "One or more imported financial postings reference a missing account ledger account.",
            });
        }

        if (posting.ledgerAccountKind === "category") {
            assertKnownReference({
                code: "ledger_import_category_missing",
                id: posting.ledgerAccountId,
                ids: categoryLedgerAccountIds,
                message:
                    "One or more imported category postings reference a missing category ledger account.",
            });
        }
    }

    for (const link of records.plaidAccountLinks) {
        assertKnownReference({
            code: "ledger_import_account_missing",
            id: link.accountId,
            ids: accountIds,
            message:
                "One or more imported Plaid links reference a missing account.",
        });
    }

    for (const syncRecord of records.plaidTransactionSyncs) {
        assertKnownReference({
            code: "ledger_import_account_missing",
            id: syncRecord.accountId,
            ids: accountIds,
            message:
                "One or more imported Plaid sync records reference a missing account.",
        });
        assertKnownReference({
            code: "ledger_import_transaction_missing",
            id: syncRecord.transactionId,
            ids: transactionIds,
            message:
                "One or more imported Plaid sync records reference a missing transaction.",
        });
        assertKnownReference({
            code: "ledger_import_plaid_link_missing",
            id: syncRecord.plaidAccountLinkId,
            ids: plaidAccountLinkIds,
            message:
                "One or more imported Plaid sync records reference a missing Plaid link.",
        });
    }

    for (const integration of records.amazonOrderIntegrations) {
        assertKnownReference({
            code: "ledger_import_account_missing",
            id: integration.accountId,
            ids: accountIds,
            message:
                "One or more imported Amazon order settings reference a missing account.",
        });
    }

    for (const template of records.transactionTemplates) {
        assertKnownReference({
            code: "ledger_import_account_missing",
            id: template.accountId,
            ids: accountIds,
            message:
                "One or more imported transaction templates reference a missing account.",
        });

        for (const line of parseTransactionTemplateLines(template)) {
            assertKnownReference({
                code: "ledger_import_category_missing",
                id: line.categoryId,
                ids: categoryIds,
                message:
                    "One or more imported transaction templates reference a missing category.",
            });
        }
    }

    for (const activity of records.transactionImportActivities) {
        assertKnownReference({
            code: "ledger_import_transaction_missing",
            id: activity.linkedTransactionId,
            ids: transactionIds,
            message:
                "One or more imported transaction activities reference a missing transaction.",
        });
    }
}

function sanitizeImportedAccount(
    account: LedgerExportAccountRecord,
    targetLedgerId: string,
): LedgerExportAccountRecord {
    const accountWithDerivedBalance = account as LedgerExportAccountRecord & {
        balanceCents?: number;
    };
    const record = omitRecordFields(accountWithDerivedBalance, [
        "balanceCents",
        "plaidAccountLinkId",
    ]);

    return removeUndefined({
        ...record,
        plaidLinkStatus: account.plaidInstitutionName ? "disabled" : undefined,
        ledgerId: targetLedgerId,
    });
}

function sanitizeImportedPlaidAccountLink(
    link: WorkspacePlaidAccountLinkRecord,
    targetLedgerId: string,
): WorkspacePlaidAccountLinkRecord {
    return removeUndefined({
        ...link,
        status: "disabled",
        ledgerId: targetLedgerId,
    });
}

function remapImportedRecords(input: {
    exportFile: LedgerExportFile;
    importScope?: LedgerImportScope;
    targetLedgerId: string;
}): LedgerTransferRecords {
    const records = selectLedgerTransferRecordsForImportScope(
        input.exportFile.records,
        input.importScope ?? "full",
    );

    return {
        accounts: records.accounts.map((record) =>
            sanitizeImportedAccount(record, input.targetLedgerId),
        ),
        allocationFundingSources: remapLedgerScopedRecords(
            records.allocationFundingSources,
            input.targetLedgerId,
        ),
        amazonOrderIntegrations: remapLedgerScopedRecords(
            records.amazonOrderIntegrations,
            input.targetLedgerId,
        ),
        amazonOrderSyncRuns: remapLedgerScopedRecords(
            records.amazonOrderSyncRuns,
            input.targetLedgerId,
        ),
        amazonOrders: remapLedgerScopedRecords(
            records.amazonOrders,
            input.targetLedgerId,
        ),
        budgetAllocations: remapLedgerScopedRecords(
            records.budgetAllocations,
            input.targetLedgerId,
        ),
        budgetCategories: remapLedgerScopedRecords(
            records.budgetCategories,
            input.targetLedgerId,
        ),
        budgetGroups: remapLedgerScopedRecords(
            records.budgetGroups,
            input.targetLedgerId,
        ),
        budgetPeriods: remapLedgerScopedRecords(
            records.budgetPeriods,
            input.targetLedgerId,
        ),
        ledgerPostings: remapLedgerScopedRecords(
            records.ledgerPostings,
            input.targetLedgerId,
        ),
        plaidAccountLinks: records.plaidAccountLinks.map((record) =>
            sanitizeImportedPlaidAccountLink(record, input.targetLedgerId),
        ),
        plaidTransactionSyncs: remapLedgerScopedRecords(
            records.plaidTransactionSyncs,
            input.targetLedgerId,
        ),
        transactionTemplates: remapLedgerScopedRecords(
            records.transactionTemplates,
            input.targetLedgerId,
        ),
        transactionImportActivities: remapLedgerScopedRecords(
            records.transactionImportActivities,
            input.targetLedgerId,
        ),
        transactionLines: remapLedgerScopedRecords(
            records.transactionLines,
            input.targetLedgerId,
        ),
        transactions: records.transactions.map((record) =>
            removeUndefined(withLedgerId(record, input.targetLedgerId)),
        ),
        venmoAccountMappings: remapLedgerScopedRecords(records.venmoAccountMappings, input.targetLedgerId),
        venmoIntegrations: records.venmoIntegrations.map((record) => removeUndefined({
            ...withLedgerId(record, input.targetLedgerId),
            inboxEnabled: false,
        })),
    };
}

function mergeTransferRecords(input: {
    existing: LedgerTransferRecords;
    imported: LedgerTransferRecords;
}): LedgerTransferRecords {
    return Object.fromEntries(
        LEDGER_TRANSFER_RECORD_FAMILIES.map((family) => [
            family.key,
            overlayById(
                getLedgerTransferRecordFamily(input.existing, family.key),
                getLedgerTransferRecordFamily(input.imported, family.key),
                (record) => getLedgerTransferRecordId(record, family.idKey),
            ),
        ]),
    ) as unknown as LedgerTransferRecords;
}

function snapshotToTransferRecords(
    snapshot: WorkspaceSnapshot | WorkspaceSnapshotPayload,
): LedgerTransferRecords {
    return {
        accounts: snapshot.accounts.map(toExportAccountRecord),
        allocationFundingSources: snapshot.allocationFundingSources,
        amazonOrderIntegrations: snapshot.amazonOrderIntegrations ?? [],
        amazonOrderSyncRuns: snapshot.amazonOrderSyncRuns ?? [],
        amazonOrders: snapshot.amazonOrders ?? [],
        budgetAllocations: snapshot.budgetAllocations,
        budgetCategories: snapshot.budgetCategories,
        budgetGroups: snapshot.budgetGroups,
        budgetPeriods: snapshot.budgetPeriods,
        ledgerPostings: snapshot.ledgerPostings,
        plaidAccountLinks: snapshot.plaidAccountLinks,
        plaidTransactionSyncs: snapshot.plaidTransactionSyncs,
        transactionTemplates: snapshot.transactionTemplates ?? [],
        transactionImportActivities:
            snapshot.transactionImportActivities ?? [],
        transactionLines: snapshot.transactionLines,
        transactions: snapshot.transactions.map(toExportTransactionRecord),
        venmoAccountMappings: snapshot.venmoAccountMappings ?? [],
        venmoIntegrations: snapshot.venmoIntegrations ?? [],
    };
}

function toPersistedTransactionRecord(input: {
    lines: WorkspaceTransactionLineRecord[];
    transaction: LedgerExportTransactionRecord;
}) {
    const transaction = {
        ...input.transaction,
        referenceCategoryId: inferTransactionReferenceCategoryId({
            displayAmountCents: input.transaction.displayAmountCents,
            kind: input.transaction.kind,
            lines: input.lines,
            referenceCategoryId: input.transaction.referenceCategoryId,
        }),
    };

    return removeUndefined(transaction);
}

async function deleteExistingTransactionChildren(input: {
    ledgerId: string;
    transactionIds: Set<string>;
}) {
    if (input.transactionIds.size === 0) {
        return;
    }

    await Promise.all(
        Array.from(input.transactionIds).flatMap((transactionId) => [
            removeTransactionChildren(input.ledgerId, transactionId),
            deletePlaidTransactionSyncsForTransaction(
                input.ledgerId,
                transactionId,
            ),
        ]),
    );
}

async function deleteMovedTransactionKeys(input: {
    importedTransactions: LedgerExportTransactionRecord[];
    ledgerId: string;
}) {
    if (input.importedTransactions.length === 0) {
        return;
    }

    const importedById = byId(
        input.importedTransactions,
        (transaction) => transaction.transactionId,
    );
    const { entities } = getBudgetedSchema();
    const existingTransactions = await queryAllPages(
        entities.transactions.query.byTransaction({ ledgerId: input.ledgerId }),
        { consistent: true },
    );

    await Promise.all(
        existingTransactions
            .filter((existingTransaction) => {
                const imported = importedById.get(
                    existingTransaction.transactionId,
                );

                return (
                    imported &&
                    imported.occurredAt !== existingTransaction.occurredAt
                );
            })
            .map((transaction) =>
                entities.transactions
                    .delete({
                        ledgerId: input.ledgerId,
                        occurredAt: transaction.occurredAt,
                        transactionId: transaction.transactionId,
                    })
                    .go(),
            ),
    );
}

async function deleteExistingRecordsForMerge(input: {
    ledgerId: string;
    records: LedgerTransferRecords;
}) {
    const transactionIds = new Set(
        input.records.transactions.map((transaction) => transaction.transactionId),
    );

    await Promise.all([
        deleteExistingTransactionChildren({
            ledgerId: input.ledgerId,
            transactionIds,
        }),
        deleteMovedTransactionKeys({
            importedTransactions: input.records.transactions,
            ledgerId: input.ledgerId,
        }),
    ]);
}

async function writeLedgerTransferRecords(records: LedgerTransferRecords) {
    const linesByTransactionId = groupBy(
        records.transactionLines,
        (line) => line.transactionId,
    );

    await writeLedgerScopedRecords({
        ...records,
        transactions: records.transactions.map((record) =>
            toPersistedTransactionRecord({
                lines: linesByTransactionId.get(record.transactionId) ?? [],
                transaction: record,
            }),
        ),
    });
}

function buildRecordCounts(records: LedgerTransferRecords) {
    return countLedgerTransferRecords(records);
}

async function assertLedgerNameIsAvailable(input: {
    ledgerId?: string;
    name: string;
}) {
    const ledgers = await listLedgers();

    if (
        ledgers.some(
            (ledger) =>
                ledger.ledgerId !== input.ledgerId &&
                ledger.name.trim().toLowerCase() ===
                    input.name.trim().toLowerCase(),
        )
    ) {
        throw new HttpError(
            409,
            "ledger_conflict",
            "A ledger with this name already exists.",
        );
    }
}

async function importIntoNewLedger(input: {
    userId: string;
    request: Extract<LedgerImportRequest, { mode: "create" }>;
}) {
    await assertLedgerNameIsAvailable({
        name: input.request.targetLedgerName,
    });
    const previewLedgerId = ulid();
    const previewRecords = remapImportedRecords({
        exportFile: input.request.exportFile as LedgerExportFile,
        importScope: input.request.importScope,
        targetLedgerId: previewLedgerId,
    });

    validateLedgerTransferRecords(previewRecords);

    const ledger = await createLedger(input.userId, {
        name: input.request.targetLedgerName,
    });
    const records = remapImportedRecords({
        exportFile: input.request.exportFile as LedgerExportFile,
        importScope: input.request.importScope,
        targetLedgerId: ledger.ledgerId,
    });

    validateLedgerTransferRecords(records);
    await writeLedgerTransferRecords(records);

    return {
        ledger,
        records,
    };
}

async function replaceActiveLedger(input: {
    activeLedgerName: string;
    ledgerId: string;
    request: Extract<LedgerImportRequest, { mode: "replace" }>;
}) {
    if (input.request.importScope === "budgetPlan") {
        throw new HttpError(
            422,
            "ledger_import_scope_unsupported",
            "Budget plan-only imports can create a new ledger or merge into the active ledger. They cannot replace a ledger.",
        );
    }

    if (input.request.confirmationName !== input.activeLedgerName) {
        throw new HttpError(
            422,
            "ledger_confirmation_mismatch",
            "The confirmation name must match the active ledger name.",
        );
    }

    const targetLedgerName =
        input.request.targetLedgerName?.trim() ||
        input.request.exportFile.sourceLedger.name;

    await assertLedgerNameIsAvailable({
        ledgerId: input.ledgerId,
        name: targetLedgerName,
    });

    const ledger = await updateLedger(input.ledgerId, {
        name: targetLedgerName,
    });
    const records = remapImportedRecords({
        exportFile: input.request.exportFile as LedgerExportFile,
        importScope: input.request.importScope,
        targetLedgerId: ledger.ledgerId,
    });

    validateLedgerTransferRecords(records);
    await deleteLedgerScopedRecords({
        ledgerId: ledger.ledgerId,
    });
    await writeLedgerTransferRecords(records);

    return {
        ledger: await bumpLedgerWorkspaceGeneration(ledger.ledgerId),
        records,
    };
}

async function mergeIntoActiveLedger(input: {
    currentUser: CurrentWorkspaceUser;
    request: Extract<LedgerImportRequest, { mode: "merge" }>;
}) {
    const snapshot = await buildWorkspaceSnapshot(input.currentUser);
    const ledger = findActiveLedger(snapshot);
    const records = remapImportedRecords({
        exportFile: input.request.exportFile as LedgerExportFile,
        importScope: input.request.importScope,
        targetLedgerId: input.currentUser.activeLedgerId,
    });
    const finalRecords = mergeTransferRecords({
        existing: snapshotToTransferRecords(snapshot),
        imported: records,
    });

    validateLedgerTransferRecords(finalRecords);
    await deleteExistingRecordsForMerge({
        ledgerId: ledger.ledgerId,
        records,
    });
    await writeLedgerTransferRecords(records);

    return {
        ledger,
        records,
    };
}

export async function importLedgerExport(
    user: CurrentWorkspaceUser,
    request: LedgerImportRequest,
): Promise<LedgerImportSummary> {
    const result =
        request.mode === "create"
            ? await importIntoNewLedger({
                  userId: user.userId,
                  request,
              })
            : request.mode === "replace"
              ? await replaceActiveLedger({
                    activeLedgerName: user.activeLedgerName,
                    ledgerId: user.activeLedgerId,
                    request,
                })
              : await mergeIntoActiveLedger({
                    currentUser: user,
                    request,
                });

    return {
        activeLedgerId: result.ledger.ledgerId,
        activeLedgerName: result.ledger.name,
        importScope: request.importScope,
        mode: request.mode,
        recordCounts: buildRecordCounts(result.records),
    };
}

export const ledgerTransferTestInternals = {
    createLedgerExportFilename,
    countLedgerTransferRecords,
    inferReferenceCategoryId: inferTransactionReferenceCategoryId,
    mergeTransferRecords,
    remapImportedRecords,
    validateLedgerTransferRecords,
};
