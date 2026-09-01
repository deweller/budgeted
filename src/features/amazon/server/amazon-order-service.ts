import { ulid } from "ulid";

import {
    findAmazonPaymentMatchCandidates,
    type AmazonMatchTransaction,
} from "@/features/amazon/models/amazon-matching";
import {
    parseAmazonOrdersPayload,
    type AmazonPaymentImportRecord,
} from "@/features/amazon/models/amazon-order-parser";
import {
    fetchAmazonScraperManifest,
    fetchAmazonScraperOrders,
    launchAmazonScraperSync,
    type AmazonScraperManifest,
} from "@/features/amazon/server/amazon-scraper-client";
import {
    amazonTransactionImporter,
    toAmazonPaymentRecord,
    type AmazonPaymentRecord,
} from "@/features/transaction-importers/models/amazon-transaction-importer";
import { createTransactionImportActivityId } from "@/features/transaction-importers/models/transaction-importer-contract";
import {
    deleteTransactionImportActivity,
    listTransactionImportActivities,
    synchronizeTransactionImportActivities,
} from "@/features/transaction-importers/server/transaction-import-activity-service";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";
import { createWorkspaceUpsertChange } from "@/features/workspace/server/workspace-change-builder";
import type {
    WorkspaceAccountRecord,
    WorkspaceAmazonOrderIntegrationRecord,
    WorkspaceAmazonOrderRecord,
    WorkspaceAmazonOrderSyncRunRecord,
} from "@/lib/workspace/sync-types";

const AMAZON_INTEGRATION_ID = "amazon-orders";

type AmazonSyncImportSummary = {
    autoMatchedCount: number;
    conflictCount: number;
    importedAt: string;
    orderCount: number;
    paymentCount: number;
    syncRun: WorkspaceAmazonOrderSyncRunRecord;
    unmatchedCount: number;
    workspaceChanges: WorkspaceMutationChangeInput[];
};

function toIntegrationRecord(input: {
    existing?: WorkspaceAmazonOrderIntegrationRecord;
    latestBudgetedImportAt?: string;
    latestBudgetedImportStatus?: WorkspaceAmazonOrderIntegrationRecord["latestBudgetedImportStatus"];
    latestScraperState?: string;
    latestScraperSyncId?: string;
    latestScraperSyncedAt?: string;
    latestSyncRunId?: string;
    lastError?: string;
    now: string;
    ledgerId: string;
    accountId?: string;
}): WorkspaceAmazonOrderIntegrationRecord {
    return {
        createdAt: input.existing?.createdAt ?? input.now,
        integrationId: AMAZON_INTEGRATION_ID,
        latestBudgetedImportStatus:
            input.latestBudgetedImportStatus ??
            input.existing?.latestBudgetedImportStatus ??
            "never",
        updatedAt: input.now,
        ledgerId: input.ledgerId,
        ...(input.accountId ?? input.existing?.accountId
            ? { accountId: input.accountId ?? input.existing?.accountId }
            : {}),
        ...(input.latestBudgetedImportAt ??
        input.existing?.latestBudgetedImportAt
            ? {
                  latestBudgetedImportAt:
                      input.latestBudgetedImportAt ??
                      input.existing?.latestBudgetedImportAt,
              }
            : {}),
        ...(input.latestScraperState ?? input.existing?.latestScraperState
            ? {
                  latestScraperState:
                      input.latestScraperState ??
                      input.existing?.latestScraperState,
              }
            : {}),
        ...(input.latestScraperSyncId ?? input.existing?.latestScraperSyncId
            ? {
                  latestScraperSyncId:
                      input.latestScraperSyncId ??
                      input.existing?.latestScraperSyncId,
              }
            : {}),
        ...(input.latestScraperSyncedAt ??
        input.existing?.latestScraperSyncedAt
            ? {
                  latestScraperSyncedAt:
                      input.latestScraperSyncedAt ??
                      input.existing?.latestScraperSyncedAt,
              }
            : {}),
        ...(input.latestSyncRunId ?? input.existing?.latestSyncRunId
            ? {
                  latestSyncRunId:
                      input.latestSyncRunId ?? input.existing?.latestSyncRunId,
              }
            : {}),
        ...(input.lastError ? { lastError: input.lastError } : {}),
    };
}

async function putIntegration(record: WorkspaceAmazonOrderIntegrationRecord) {
    const { entities } = getBudgetedSchema();

    await entities.amazonOrderIntegrations.put(record).go();
}

async function listAmazonOrderIntegrations(ledgerId: string) {
    const { entities } = getBudgetedSchema();

    return (await queryAllPages(
        entities.amazonOrderIntegrations.query.byIntegration({ ledgerId }),
        { consistent: true },
    )) as WorkspaceAmazonOrderIntegrationRecord[];
}

async function getAmazonOrderIntegration(ledgerId: string) {
    return listAmazonOrderIntegrations(ledgerId).then((integrations) =>
        integrations.find(
            (integration) => integration.integrationId === AMAZON_INTEGRATION_ID,
        ),
    );
}

async function requireAmazonOrderIntegration(ledgerId: string) {
    const integration = await getAmazonOrderIntegration(ledgerId);

    if (!integration?.accountId) {
        throw new HttpError(
            422,
            "amazon_account_required",
            "Choose an Amazon credit card account before syncing.",
        );
    }

    return integration;
}

async function getAccount(ledgerId: string, accountId: string) {
    const { entities } = getBudgetedSchema();
    const accounts = (await queryAllPages(
        entities.accounts.query.byAccount({ ledgerId }),
        { consistent: true },
    )) as WorkspaceAccountRecord[];

    return accounts.find((account) => account.accountId === accountId);
}

async function requireAmazonCreditCardAccount(
    ledgerId: string,
    accountId: string,
) {
    const account = await getAccount(ledgerId, accountId);

    if (!account) {
        throw new HttpError(404, "account_missing", "The account is missing.");
    }

    if (account.accountType !== "creditCard") {
        throw new HttpError(
            422,
            "amazon_account_must_be_credit_card",
            "Amazon orders can only be matched to a credit card account.",
        );
    }

    return account;
}

async function listAmazonOrders(ledgerId: string) {
    const { entities } = getBudgetedSchema();

    return (await queryAllPages(
        entities.amazonOrders.query.byOrder({ ledgerId }),
        { consistent: true },
    )) as WorkspaceAmazonOrderRecord[];
}

async function listAmazonPayments(ledgerId: string) {
    return (await listTransactionImportActivities(ledgerId))
        .filter((activity) => activity.provider === "amazon")
        .map(toAmazonPaymentRecord);
}

async function listAmazonSyncRuns(ledgerId: string) {
    const { entities } = getBudgetedSchema();

    return (await queryAllPages(
        entities.amazonOrderSyncRuns.query.bySyncRun({ ledgerId }),
        { consistent: true },
    )) as WorkspaceAmazonOrderSyncRunRecord[];
}

async function listMatchingTransactions(
    ledgerId: string,
): Promise<AmazonMatchTransaction[]> {
    const { entities } = getBudgetedSchema();
    const [transactions, postings] = await Promise.all([
        queryAllPages(entities.transactions.query.byTransaction({ ledgerId }), {
            consistent: true,
        }),
        queryAllPages(entities.ledgerPostings.query.byPosting({ ledgerId }), {
            consistent: true,
        }),
    ]);
    const postingsByTransactionId = new Map<string, typeof postings>();

    for (const posting of postings) {
        const existing = postingsByTransactionId.get(posting.transactionId) ?? [];
        existing.push(posting);
        postingsByTransactionId.set(posting.transactionId, existing);
    }

    return transactions.map((transaction) => ({
        displayAmountCents: transaction.displayAmountCents,
        occurredAt: transaction.occurredAt,
        postings:
            postingsByTransactionId.get(transaction.transactionId)?.map(
                (posting) => ({
                    amountCents: posting.amountCents,
                    direction: posting.direction,
                    ledgerAccountId: posting.ledgerAccountId,
                    ledgerAccountKind: posting.ledgerAccountKind,
                }),
            ) ?? [],
        referenceAccountId: transaction.referenceAccountId,
        status: transaction.status,
        transactionId: transaction.transactionId,
    }));
}

function parseCandidateTransactionIds(value: string | undefined) {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);

        return Array.isArray(parsed)
            ? parsed.filter((candidate): candidate is string =>
                  typeof candidate === "string",
              )
            : [];
    } catch {
        return [];
    }
}

function getLatestScraperSyncedAt(manifest?: AmazonScraperManifest) {
    return (
        manifest?.lastSuccessfulSyncAt ??
        manifest?.updatedAt ??
        undefined
    );
}

function createSyncRunRecord(input: {
    existing?: WorkspaceAmazonOrderSyncRunRecord;
    manifest?: AmazonScraperManifest;
    mode: "latest" | "launch";
    now: string;
    status: WorkspaceAmazonOrderSyncRunRecord["status"];
    syncRunId: string;
    ledgerId: string;
    error?: string;
    importedAt?: string;
    summary?: Pick<
        WorkspaceAmazonOrderSyncRunRecord,
        | "autoMatchedCount"
        | "conflictCount"
        | "orderCount"
        | "paymentCount"
        | "unmatchedCount"
    >;
}): WorkspaceAmazonOrderSyncRunRecord {
    return {
        mode: input.mode,
        startedAt: input.existing?.startedAt ?? input.now,
        status: input.status,
        syncRunId: input.syncRunId,
        updatedAt: input.now,
        ledgerId: input.ledgerId,
        ...(input.existing?.completedAt
            ? { completedAt: input.existing.completedAt }
            : {}),
        ...(input.importedAt ? { importedAt: input.importedAt } : {}),
        ...(input.status === "succeeded" || input.status === "failed"
            ? { completedAt: input.now }
            : {}),
        ...(input.error ? { error: input.error } : {}),
        ...(input.manifest?.syncId ? { scraperSyncId: input.manifest.syncId } : {}),
        ...(input.manifest?.task?.arn
            ? { scraperTaskArn: input.manifest.task.arn }
            : {}),
        ...(input.manifest?.task?.status
            ? { scraperTaskStatus: input.manifest.task.status }
            : {}),
        ...(input.manifest?.state ? { scraperState: input.manifest.state } : {}),
        ...(input.summary ?? {}),
    };
}

function toStoredOrder(input: {
    existing?: WorkspaceAmazonOrderRecord;
    importedAt: string;
    order: ReturnType<typeof parseAmazonOrdersPayload>["orders"][number];
    sourceSyncId?: string;
    ledgerId: string;
}): WorkspaceAmazonOrderRecord {
    return {
        amazonOrderId: input.order.amazonOrderId,
        firstImportedAt: input.existing?.firstImportedAt ?? input.importedAt,
        itemSummary: input.order.itemSummary,
        itemTitlesJson: JSON.stringify(input.order.itemTitles),
        lastImportedAt: input.importedAt,
        orderNumber: input.order.orderNumber,
        sourcePayloadJson: input.order.sourcePayloadJson,
        updatedAt: input.importedAt,
        ledgerId: input.ledgerId,
        ...(input.order.grandTotalCents !== undefined
            ? { grandTotalCents: input.order.grandTotalCents }
            : {}),
        ...(input.order.orderPlacedDate
            ? { orderPlacedDate: input.order.orderPlacedDate }
            : {}),
        ...(input.sourceSyncId ?? input.existing?.sourceSyncId
            ? {
                  sourceSyncId:
                      input.sourceSyncId ?? input.existing?.sourceSyncId,
              }
            : {}),
    };
}

function createBasePaymentRecord(input: {
    existing?: AmazonPaymentRecord;
    importedAt: string;
    payment: AmazonPaymentImportRecord;
    sourceSyncId?: string;
    ledgerId: string;
}): AmazonPaymentRecord {
    return {
        amazonPaymentId: input.payment.amazonPaymentId,
        amountCents: input.payment.amountCents,
        completedDate: input.payment.completedDate,
        firstImportedAt: input.existing?.firstImportedAt ?? input.importedAt,
        isRefund: input.payment.isRefund,
        itemSummary: input.payment.itemSummary,
        lastImportedAt: input.importedAt,
        matchStatus: "unmatched",
        orderNumber: input.payment.orderNumber,
        updatedAt: input.importedAt,
        ledgerId: input.ledgerId,
        ...(input.payment.paymentMethod
            ? { paymentMethod: input.payment.paymentMethod }
            : {}),
        ...(input.payment.paymentMethodLast4
            ? { paymentMethodLast4: input.payment.paymentMethodLast4 }
            : {}),
        ...(input.payment.seller ? { seller: input.payment.seller } : {}),
        ...(input.sourceSyncId ?? input.existing?.sourceSyncId
            ? {
                  sourceSyncId:
                      input.sourceSyncId ?? input.existing?.sourceSyncId,
              }
            : {}),
    };
}

function isImportedOrderUnchanged(input: {
    existing: WorkspaceAmazonOrderRecord;
    order: ReturnType<typeof parseAmazonOrdersPayload>["orders"][number];
}) {
    return (
        input.existing.amazonOrderId === input.order.amazonOrderId &&
        input.existing.grandTotalCents === input.order.grandTotalCents &&
        input.existing.itemSummary === input.order.itemSummary &&
        input.existing.itemTitlesJson ===
            JSON.stringify(input.order.itemTitles) &&
        input.existing.orderNumber === input.order.orderNumber &&
        input.existing.orderPlacedDate === input.order.orderPlacedDate &&
        input.existing.sourcePayloadJson === input.order.sourcePayloadJson
    );
}

function isImportedPaymentUnchanged(input: {
    existing: AmazonPaymentRecord;
    payment: AmazonPaymentImportRecord;
}) {
    return (
        input.existing.amazonPaymentId === input.payment.amazonPaymentId &&
        input.existing.amountCents === input.payment.amountCents &&
        input.existing.completedDate === input.payment.completedDate &&
        input.existing.isRefund === input.payment.isRefund &&
        input.existing.itemSummary === input.payment.itemSummary &&
        input.existing.orderNumber === input.payment.orderNumber &&
        input.existing.paymentMethod === input.payment.paymentMethod &&
        input.existing.paymentMethodLast4 ===
            input.payment.paymentMethodLast4 &&
        input.existing.seller === input.payment.seller
    );
}

function arePaymentRecordsEquivalent(
    left: AmazonPaymentRecord,
    right: AmazonPaymentRecord,
) {
    return (
        left.amazonPaymentId === right.amazonPaymentId &&
        left.amountCents === right.amountCents &&
        left.candidateTransactionIdsJson ===
            right.candidateTransactionIdsJson &&
        left.completedDate === right.completedDate &&
        left.firstImportedAt === right.firstImportedAt &&
        left.isRefund === right.isRefund &&
        left.itemSummary === right.itemSummary &&
        left.ledgerId === right.ledgerId &&
        left.matchStatus === right.matchStatus &&
        left.matchedTransactionId === right.matchedTransactionId &&
        left.orderNumber === right.orderNumber &&
        left.paymentMethod === right.paymentMethod &&
        left.paymentMethodLast4 === right.paymentMethodLast4 &&
        left.seller === right.seller
    );
}

function isResolvedPayment(
    payment: AmazonPaymentRecord,
): payment is AmazonPaymentRecord & {
    matchedTransactionId: string;
} {
    return (
        (payment.matchStatus === "autoMatched" ||
            payment.matchStatus === "manualMatched") &&
        Boolean(payment.matchedTransactionId)
    );
}

function getManuallyMatchedTransactionId(input: {
    candidates: string[];
    existing?: AmazonPaymentRecord;
}) {
    if (
        input.existing?.matchStatus === "manualMatched" &&
        input.existing.matchedTransactionId &&
        input.candidates.includes(input.existing.matchedTransactionId)
    ) {
        return input.existing.matchedTransactionId;
    }

    return null;
}

async function buildMatchedPaymentRecords(input: {
    account: WorkspaceAccountRecord;
    existingPayments: AmazonPaymentRecord[];
    importedAt: string;
    payments: AmazonPaymentImportRecord[];
    sourceSyncId?: string;
    transactions: AmazonMatchTransaction[];
    ledgerId: string;
}): Promise<{
    records: AmazonPaymentRecord[];
}> {
    const existingById = new Map(
        input.existingPayments.map((payment) => [
            payment.amazonPaymentId,
            payment,
        ]),
    );
    const transactionById = new Map(
        input.transactions.map((transaction) => [
            transaction.transactionId,
            transaction,
        ]),
    );
    const preservedResolvedPaymentIds = new Set<string>();
    const matchedTransactionIds = new Set<string>();
    const records: AmazonPaymentRecord[] = [];
    const sortedPayments = [...input.payments].sort((left, right) => {
        const dateComparison = left.completedDate.localeCompare(
            right.completedDate,
        );

        return dateComparison || left.amazonPaymentId.localeCompare(right.amazonPaymentId);
    });
    const candidatesByPaymentId = new Map(
        sortedPayments.map((payment) => [
            payment.amazonPaymentId,
            findAmazonPaymentMatchCandidates({
                account: input.account,
                payment,
                transactions: input.transactions,
            }),
        ]),
    );
    const paymentIdsBySoleCandidate = new Map<string, string[]>();

    for (const payment of sortedPayments) {
        const candidates = candidatesByPaymentId.get(payment.amazonPaymentId) ?? [];

        if (candidates.length !== 1) {
            continue;
        }

        const transactionId = candidates[0]!;
        paymentIdsBySoleCandidate.set(transactionId, [
            ...(paymentIdsBySoleCandidate.get(transactionId) ?? []),
            payment.amazonPaymentId,
        ]);
    }

    const contestedPaymentIds = new Set(
        [...paymentIdsBySoleCandidate.values()]
            .filter((paymentIds) => paymentIds.length > 1)
            .flat(),
    );

    for (const payment of sortedPayments) {
        const existing = existingById.get(payment.amazonPaymentId);

        if (
            contestedPaymentIds.has(payment.amazonPaymentId) ||
            !existing ||
            !isResolvedPayment(existing) ||
            !isImportedPaymentUnchanged({ existing, payment }) ||
            !transactionById.has(existing.matchedTransactionId)
        ) {
            continue;
        }

        const matchedTransaction = transactionById.get(
            existing.matchedTransactionId,
        );

        if (
            !matchedTransaction ||
            !findAmazonPaymentMatchCandidates({
                account: input.account,
                payment,
                transactions: [matchedTransaction],
            }).includes(existing.matchedTransactionId)
        ) {
            continue;
        }

        preservedResolvedPaymentIds.add(payment.amazonPaymentId);
        matchedTransactionIds.add(existing.matchedTransactionId);
    }

    for (const payment of sortedPayments) {
        const existing = existingById.get(payment.amazonPaymentId);

        if (
            existing &&
            preservedResolvedPaymentIds.has(payment.amazonPaymentId)
        ) {
            records.push(existing);
            continue;
        }

        const basePayment = createBasePaymentRecord({
            existing,
            importedAt: input.importedAt,
            payment,
            sourceSyncId: input.sourceSyncId,
            ledgerId: input.ledgerId,
        });
        const rawCandidates =
            candidatesByPaymentId.get(payment.amazonPaymentId) ?? [];
        const candidates = contestedPaymentIds.has(payment.amazonPaymentId)
            ? rawCandidates
            : findAmazonPaymentMatchCandidates({
                  account: input.account,
                  excludedTransactionIds: new Set(matchedTransactionIds),
                  payment,
                  transactions: input.transactions,
              });
        const manualTransactionId = getManuallyMatchedTransactionId({
            candidates,
            existing,
        });
        let nextRecord: AmazonPaymentRecord;

        if (contestedPaymentIds.has(payment.amazonPaymentId)) {
            nextRecord = {
                ...basePayment,
                candidateTransactionIdsJson: JSON.stringify(candidates),
                matchStatus: "conflict",
            };
        } else if (manualTransactionId) {
            nextRecord = {
                ...basePayment,
                candidateTransactionIdsJson: JSON.stringify(candidates),
                matchStatus: "manualMatched",
                matchedTransactionId: manualTransactionId,
            };
            matchedTransactionIds.add(manualTransactionId);
        } else if (candidates.length === 1) {
            const matchedTransactionId = candidates[0]!;
            nextRecord = {
                ...basePayment,
                candidateTransactionIdsJson: JSON.stringify(candidates),
                matchStatus: "autoMatched",
                matchedTransactionId,
            };
            matchedTransactionIds.add(matchedTransactionId);
        } else {
            nextRecord = {
                ...basePayment,
                ...(candidates.length > 0
                    ? {
                          candidateTransactionIdsJson:
                              JSON.stringify(candidates),
                          matchStatus: "conflict" as const,
                      }
                    : { matchStatus: "unmatched" as const }),
            };
        }

        if (existing && arePaymentRecordsEquivalent(existing, nextRecord)) {
            records.push(existing);
            continue;
        }

        records.push(nextRecord);
    }

    return { records };
}

function summarizePayments(payments: AmazonPaymentRecord[]) {
    return {
        autoMatchedCount: payments.filter(
            (payment) => payment.matchStatus === "autoMatched",
        ).length,
        conflictCount: payments.filter(
            (payment) => payment.matchStatus === "conflict",
        ).length,
        unmatchedCount: payments.filter(
            (payment) => payment.matchStatus === "unmatched",
        ).length,
    };
}

async function persistImportedAmazonOrders(input: {
    importedAt: string;
    integration: WorkspaceAmazonOrderIntegrationRecord;
    manifest?: AmazonScraperManifest;
    mode: "latest" | "launch";
    ordersPayload: unknown;
    syncRunId: string;
    ledgerId: string;
}): Promise<AmazonSyncImportSummary> {
    const { entities } = getBudgetedSchema();
    const account = await requireAmazonCreditCardAccount(
        input.ledgerId,
        input.integration.accountId!,
    );
    const parsed = parseAmazonOrdersPayload(input.ordersPayload);
    const [existingOrders, existingPayments, transactions] = await Promise.all([
        listAmazonOrders(input.ledgerId),
        listAmazonPayments(input.ledgerId),
        listMatchingTransactions(input.ledgerId),
    ]);
    const existingOrdersById = new Map(
        existingOrders.map((order) => [order.amazonOrderId, order]),
    );
    const importedOrderNumbers = new Set(
        parsed.orders.map((order) => order.orderNumber),
    );
    const importedPaymentIds = new Set(
        parsed.payments.map((payment) => payment.amazonPaymentId),
    );
    const stalePayments = existingPayments.filter(
        (payment) =>
            importedOrderNumbers.has(payment.orderNumber) &&
            !importedPaymentIds.has(payment.amazonPaymentId),
    );
    const stalePaymentIds = new Set(
        stalePayments.map((payment) => payment.amazonPaymentId),
    );
    const retainedExistingPayments = existingPayments.filter(
        (payment) => !stalePaymentIds.has(payment.amazonPaymentId),
    );
    const changedOrderRecords: WorkspaceAmazonOrderRecord[] = [];
    const orderRecords = parsed.orders.map((order) => {
        const existing = existingOrdersById.get(order.amazonOrderId);

        if (existing && isImportedOrderUnchanged({ existing, order })) {
            return existing;
        }

        const record = toStoredOrder({
            existing,
            importedAt: input.importedAt,
            order,
            sourceSyncId: input.manifest?.syncId,
            ledgerId: input.ledgerId,
        });
        changedOrderRecords.push(record);

        return record;
    });
    const paymentResult = await buildMatchedPaymentRecords({
        account,
        existingPayments: retainedExistingPayments,
        importedAt: input.importedAt,
        payments: parsed.payments,
        sourceSyncId: input.manifest?.syncId,
        transactions,
        ledgerId: input.ledgerId,
    });
    const paymentRecords = paymentResult.records;
    const summary = summarizePayments(paymentRecords);
    const syncRun = createSyncRunRecord({
        importedAt: input.importedAt,
        manifest: input.manifest,
        mode: input.mode,
        now: input.importedAt,
        status: "succeeded",
        summary: {
            ...summary,
            orderCount: orderRecords.length,
            paymentCount: paymentRecords.length,
        },
        syncRunId: input.syncRunId,
        ledgerId: input.ledgerId,
    });
    const integration = toIntegrationRecord({
        existing: input.integration,
        latestBudgetedImportAt: input.importedAt,
        latestBudgetedImportStatus: "succeeded",
        latestScraperState: input.manifest?.state,
        latestScraperSyncId: input.manifest?.syncId,
        latestScraperSyncedAt: getLatestScraperSyncedAt(input.manifest),
        latestSyncRunId: input.syncRunId,
        now: input.importedAt,
        ledgerId: input.ledgerId,
    });

    await Promise.all([
        ...changedOrderRecords.map((record) =>
            entities.amazonOrders.put(record).go(),
        ),
        entities.amazonOrderSyncRuns.put(syncRun).go(),
        putIntegration(integration),
    ]);
    const [canonicalPayments, deletedCanonicalPayments] = await Promise.all([
        synchronizeTransactionImportActivities(
            paymentRecords.map((payment) =>
                amazonTransactionImporter.normalize(payment),
            ),
        ),
        Promise.all(
            stalePayments.map((payment) =>
                deleteTransactionImportActivity({
                    activityId: createTransactionImportActivityId(
                        "amazon",
                        payment.amazonPaymentId,
                    ),
                    ledgerId: input.ledgerId,
                }),
            ),
        ),
    ]);

    return {
        ...summary,
        importedAt: input.importedAt,
        orderCount: orderRecords.length,
        paymentCount: paymentRecords.length,
        syncRun,
        workspaceChanges: [
            ...changedOrderRecords.map((record) =>
                createWorkspaceUpsertChange({
                    entityId: record.amazonOrderId,
                    entityType: "amazonOrder",
                    previousRecord:
                        existingOrdersById.get(record.amazonOrderId) ?? null,
                    record,
                }),
            ),
            createWorkspaceUpsertChange({
                entityId: syncRun.syncRunId,
                entityType: "amazonOrderSyncRun",
                previousRecord: null,
                record: syncRun,
            }),
            createWorkspaceUpsertChange({
                entityId: integration.integrationId,
                entityType: "amazonOrderIntegration",
                previousRecord: input.integration,
                record: integration,
            }),
            ...canonicalPayments.workspaceChanges,
            ...deletedCanonicalPayments.flatMap(
                (result) => result.workspaceChanges,
            ),
        ],
    };
}

async function saveAmazonOrderSettingsInternal(input: {
    accountId: string;
    ledgerId: string;
}) {
    const account = await requireAmazonCreditCardAccount(
        input.ledgerId,
        input.accountId,
    );
    const [existing, payments] = await Promise.all([
        getAmazonOrderIntegration(input.ledgerId),
        listAmazonPayments(input.ledgerId),
    ]);
    const now = new Date().toISOString();

    const integration = toIntegrationRecord({
        accountId: account.accountId,
        existing,
        now,
        ledgerId: input.ledgerId,
    });
    const updatedPayments =
        existing?.accountId && existing.accountId !== account.accountId
            ? payments.map((payment) => ({
                  ...payment,
                  candidateTransactionIdsJson: undefined,
                  matchStatus: "unmatched" as const,
                  matchedTransactionId: undefined,
                  updatedAt: now,
              }))
            : [];

    await putIntegration(integration);

    const canonicalPayments = await synchronizeTransactionImportActivities(
        updatedPayments.map((payment) =>
            amazonTransactionImporter.normalize(payment),
        ),
    );

    return {
        integration,
        workspaceChanges: [
            createWorkspaceUpsertChange({
                entityId: integration.integrationId,
                entityType: "amazonOrderIntegration",
                previousRecord: existing,
                record: integration,
            }),
            ...canonicalPayments.workspaceChanges,
        ],
    };
}

export async function saveAmazonOrderSettings(input: {
    accountId: string;
    ledgerId: string;
}) {
    return (await saveAmazonOrderSettingsInternal(input)).integration;
}

export async function saveAmazonOrderSettingsWithWorkspaceChanges(input: {
    accountId: string;
    ledgerId: string;
}) {
    return saveAmazonOrderSettingsInternal(input);
}

export async function readAmazonScraperManifest() {
    return fetchAmazonScraperManifest();
}

export async function syncLatestAmazonOrders(ledgerId: string) {
    const integration = await requireAmazonOrderIntegration(ledgerId);
    const syncRunId = ulid();
    const [manifest, ordersPayload] = await Promise.all([
        fetchAmazonScraperManifest(),
        fetchAmazonScraperOrders(),
    ]);

    return persistImportedAmazonOrders({
        importedAt: new Date().toISOString(),
        integration,
        manifest,
        mode: "latest",
        ordersPayload,
        syncRunId,
        ledgerId,
    });
}

export async function launchAmazonOrderSync(ledgerId: string) {
    const integration = await requireAmazonOrderIntegration(ledgerId);
    const launchResult = await launchAmazonScraperSync();
    const now = new Date().toISOString();
    const syncRunId = ulid();
    const manifest = launchResult.manifest;
    const syncRun = {
        ...createSyncRunRecord({
            manifest,
            mode: "launch",
            now,
            status: "waitingForScraper",
            syncRunId,
            ledgerId,
        }),
        ...(launchResult.syncId ? { scraperSyncId: launchResult.syncId } : {}),
        ...(launchResult.taskArn
            ? { scraperTaskArn: launchResult.taskArn }
            : {}),
        ...(launchResult.taskStatus
            ? { scraperTaskStatus: launchResult.taskStatus }
            : {}),
    };
    const nextIntegration = toIntegrationRecord({
        existing: integration,
        latestBudgetedImportStatus: "running",
        latestScraperState: manifest?.state,
        latestScraperSyncId: manifest?.syncId ?? launchResult.syncId,
        latestScraperSyncedAt: getLatestScraperSyncedAt(manifest),
        latestSyncRunId: syncRunId,
        now,
        ledgerId,
    });

    await Promise.all([
        getBudgetedSchema().entities.amazonOrderSyncRuns.put(syncRun).go(),
        putIntegration(nextIntegration),
    ]);

    return {
        ...syncRun,
        workspaceChanges: [
            createWorkspaceUpsertChange({
                entityId: syncRun.syncRunId,
                entityType: "amazonOrderSyncRun",
                previousRecord: null,
                record: syncRun,
            }),
            createWorkspaceUpsertChange({
                entityId: nextIntegration.integrationId,
                entityType: "amazonOrderIntegration",
                previousRecord: integration,
                record: nextIntegration,
            }),
        ],
    };
}

function isManifestComplete(manifest: AmazonScraperManifest) {
    return manifest.state === "complete";
}

function isManifestFailed(manifest: AmazonScraperManifest) {
    return manifest.state === "failed";
}

export async function pollAmazonOrderSyncRun(input: {
    ledgerId: string;
    syncRunId: string;
}) {
    const [integration, runs] = await Promise.all([
        requireAmazonOrderIntegration(input.ledgerId),
        listAmazonSyncRuns(input.ledgerId),
    ]);
    const run = runs.find((candidate) => candidate.syncRunId === input.syncRunId);

    if (!run) {
        throw new HttpError(
            404,
            "amazon_sync_run_missing",
            "The Amazon sync run could not be found.",
        );
    }

    if (run.status === "succeeded" || run.status === "failed") {
        return { ...run, workspaceChanges: [] };
    }

    const manifest = await fetchAmazonScraperManifest();
    const now = new Date().toISOString();

    if (isManifestComplete(manifest)) {
        return persistImportedAmazonOrders({
            importedAt: now,
            integration,
            manifest,
            mode: run.mode,
            ordersPayload: await fetchAmazonScraperOrders(),
            syncRunId: input.syncRunId,
            ledgerId: input.ledgerId,
        });
    }

    const nextRun = createSyncRunRecord({
        existing: run,
        manifest,
        mode: run.mode,
        now,
        status: isManifestFailed(manifest) ? "failed" : "waitingForScraper",
        syncRunId: run.syncRunId,
        ledgerId: input.ledgerId,
        error: manifest.lastError ?? undefined,
    });
    const nextIntegration = toIntegrationRecord({
        existing: integration,
        latestBudgetedImportStatus:
            nextRun.status === "failed" ? "failed" : "running",
        latestScraperState: manifest.state,
        latestScraperSyncId: manifest.syncId,
        latestScraperSyncedAt: getLatestScraperSyncedAt(manifest),
        latestSyncRunId: run.syncRunId,
        lastError: manifest.lastError ?? undefined,
        now,
        ledgerId: input.ledgerId,
    });

    await Promise.all([
        getBudgetedSchema().entities.amazonOrderSyncRuns.put(nextRun).go(),
        putIntegration(nextIntegration),
    ]);

    return {
        ...nextRun,
        workspaceChanges: [
            createWorkspaceUpsertChange({
                entityId: nextRun.syncRunId,
                entityType: "amazonOrderSyncRun",
                previousRecord: run,
                record: nextRun,
            }),
            createWorkspaceUpsertChange({
                entityId: nextIntegration.integrationId,
                entityType: "amazonOrderIntegration",
                previousRecord: integration,
                record: nextIntegration,
            }),
        ],
    };
}

export async function manuallyMatchAmazonPayment(input: {
    amazonPaymentId: string;
    ledgerId: string;
    transactionId: string;
}) {
    const [integration, payments] = await Promise.all([
        requireAmazonOrderIntegration(input.ledgerId),
        listAmazonPayments(input.ledgerId),
    ]);
    const payment = payments.find(
        (candidate) => candidate.amazonPaymentId === input.amazonPaymentId,
    );

    if (!payment) {
        throw new HttpError(
            404,
            "amazon_payment_missing",
            "The Amazon payment could not be found.",
        );
    }

    const owningPayment = payments.find(
        (candidate) =>
            candidate.amazonPaymentId !== payment.amazonPaymentId &&
            isResolvedPayment(candidate) &&
            candidate.matchedTransactionId === input.transactionId,
    );

    if (owningPayment) {
        throw new HttpError(
            409,
            "amazon_match_transaction_claimed",
            "The transaction is already matched to another Amazon payment.",
        );
    }

    const account = await requireAmazonCreditCardAccount(
        input.ledgerId,
        integration.accountId!,
    );
    const candidates = findAmazonPaymentMatchCandidates({
        account,
        payment,
        transactions: await listMatchingTransactions(input.ledgerId),
    });

    if (!candidates.includes(input.transactionId)) {
        throw new HttpError(
            409,
            "amazon_match_invalid",
            "Choose a matching transaction with the same amount within two days.",
        );
    }

    const now = new Date().toISOString();
    const nextPayment: AmazonPaymentRecord = {
        ...payment,
        candidateTransactionIdsJson: JSON.stringify(candidates),
        matchStatus: "manualMatched",
        matchedTransactionId: input.transactionId,
        updatedAt: now,
    };

    const canonicalPayment = await synchronizeTransactionImportActivities([
            amazonTransactionImporter.normalize(nextPayment),
        ]);

    return {
        ...nextPayment,
        workspaceChanges: canonicalPayment.workspaceChanges,
    };
}

export { parseCandidateTransactionIds };
