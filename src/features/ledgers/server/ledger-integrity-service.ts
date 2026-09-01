import { toVisibleReferenceCategoryId } from "@/features/transactions/models/reference-category";
import { formatTransactionDisplayDate } from "@/features/transactions/models/transaction-date";
import {
    toPublicTransactionLineCategoryId,
    toPublicTransactionLineFromAccountId,
    toPublicTransactionLineToAccountId,
} from "@/features/transactions/models/transaction-line-normalization";
import type { AccountType } from "@/modules/accounts/account-types";
import {
    UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID,
    isUserVisibleBudgetCategory,
    listOpeningBalanceFundingRowsForPeriod,
} from "@/modules/budgeting";
import {
    getMonthlyPeriodBounds,
    getMonthlyPeriodId,
    type MonthlyPeriod,
} from "@/modules/ledger";
import { calculateAccountBalanceCents } from "@/modules/ledger/account-balance";
import {
    assertValidTransactionPostings,
    buildTransactionLinePostingInputs,
    getFinancialPostingDeltaForLedgerAccount,
    groupTransactionPostingInputs,
    type TransactionPostingInput,
} from "@/modules/ledger/posting-rules";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { formatUsd } from "@/lib/formatting/money";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";

export type LedgerIntegrityAccount = {
    accountId: string;
    accountType: AccountType;
    ledgerAccountId: string;
    ledgerId: string;
    name: string;
    openedOn: string;
    openingBalanceCents: number;
};

export type LedgerIntegrityBudgetCategory = {
    allocationCadence?: "monthly" | "yearly";
    allocationStartMonth?: number;
    categoryId: string;
    defaultAssignedCents: number;
    groupId: string;
    isIncomeCategory: boolean;
    ledgerAccountId: string;
    ledgerId: string;
    name: string;
    sortOrder: number;
    status: "active" | "archived";
    systemCategoryKey?: "startingBalances";
};

export type LedgerIntegrityBudgetAllocation = {
    allocationId: string;
    assignedCents: number;
    categoryId: string;
    ledgerId: string;
    periodId: string;
};

export type LedgerIntegrityBudgetPeriod = {
    availableToBudgetCents?: number;
    endsOn: string;
    ledgerId: string;
    periodId: string;
    startsOn: string;
    status: "open" | "closed";
};

export type LedgerIntegrityTransaction = {
    displayAmountCents: number;
    kind: "adjustment" | "standard";
    ledgerId: string;
    occurredAt: string;
    payee?: string;
    periodId: string;
    referenceAccountId: string;
    referenceCategoryId?: string;
    status: "cleared" | "entered" | "reconciled" | "voided";
    transactionId: string;
};

export type LedgerIntegrityTransactionLine = {
    amountCents: number;
    categoryId?: string;
    fromAccountId?: string;
    ledgerId: string;
    lineId: string;
    sortOrder: number;
    toAccountId?: string;
    transactionId: string;
};

export type LedgerIntegrityPosting = {
    amountCents: number;
    direction: "credit" | "debit";
    ledgerAccountId: string;
    ledgerAccountKind: "category" | "equity" | "financial";
    ledgerId: string;
    occurredAt: string;
    periodId: string;
    postingId: string;
    transactionId: string;
};

export type LedgerIntegrityLedger = {
    ledgerId: string;
    name: string;
    status: "active" | "archived";
    workspaceId: string;
};

export type LedgerIntegrityRecords = {
    accounts: LedgerIntegrityAccount[];
    budgetAllocations: LedgerIntegrityBudgetAllocation[];
    budgetCategories: LedgerIntegrityBudgetCategory[];
    budgetPeriods: LedgerIntegrityBudgetPeriod[];
    ledger: LedgerIntegrityLedger;
    ledgerPostings: LedgerIntegrityPosting[];
    transactionLines: LedgerIntegrityTransactionLine[];
    transactions: LedgerIntegrityTransaction[];
};

export type LedgerIntegrityFinding = {
    actualCents?: number;
    code: string;
    entityId?: string;
    entityType?:
        | "account"
        | "budgetAllocation"
        | "budgetCategory"
        | "budgetPeriod"
        | "ledgerPosting"
        | "transaction"
        | "transactionLine";
    expectedCents?: number;
    message: string;
    relatedEntityIds?: string[];
    severity: "error" | "warning";
    transactionId?: string;
    transactionSummary?: string;
};

export type LedgerIntegrityCheckResult = {
    checkedAt: string;
    errorCount: number;
    findings: LedgerIntegrityFinding[];
    ledger: LedgerIntegrityLedger;
    reconciliation: LedgerIntegrityReconciliation;
    recordCounts: Record<
        | "account"
        | "budgetAllocation"
        | "budgetCategory"
        | "budgetPeriod"
        | "ledgerPosting"
        | "transaction"
        | "transactionLine",
        number
    >;
    status: "failed" | "passed" | "warning";
    warningCount: number;
};

export type LedgerIntegrityAccountBalance = {
    accountId: string;
    accountName: string;
    accountType: AccountType;
    currentBalanceCents: number;
    ledgerAccountId: string;
    openedOn: string;
    openingBalanceCents: number;
    postingDeltaCents: number;
};

export type LedgerIntegrityPeriodAccountBalance = {
    accountId: string;
    accountName: string;
    balanceCents: number;
};

export type LedgerIntegrityPeriodBalance = {
    accountBalances: LedgerIntegrityPeriodAccountBalance[];
    assetBalanceCents: number;
    endsOn: string;
    liabilityBalanceCents: number;
    netBalanceCents: number;
    periodId: string;
    startsOn: string;
};

export type LedgerIntegrityReconciliationTotals = {
    assetBalanceCents: number;
    currentBalanceCents: number;
    liabilityBalanceCents: number;
    openingBalanceCents: number;
    postingDeltaCents: number;
};

export type LedgerIntegrityReconciliation = {
    accounts: LedgerIntegrityAccountBalance[];
    periods: LedgerIntegrityPeriodBalance[];
    totals: LedgerIntegrityReconciliationTotals;
};

type PostingComparison = Pick<
    TransactionPostingInput,
    "amountCents" | "direction" | "ledgerAccountId" | "ledgerAccountKind"
>;

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const BUDGET_ALLOCATION_SOURCE_BLOCKING_CODES = new Set([
    "account_opened_on_invalid",
]);

function compareLedgerNames(
    left: LedgerIntegrityLedger,
    right: LedgerIntegrityLedger,
) {
    return left.name.localeCompare(right.name);
}

function addFinding(
    findings: LedgerIntegrityFinding[],
    finding: LedgerIntegrityFinding,
) {
    findings.push(finding);
}

function groupById<TRecord>(
    records: TRecord[],
    getId: (record: TRecord) => string,
) {
    const grouped = new Map<string, TRecord[]>();

    for (const record of records) {
        const id = getId(record);
        grouped.set(id, [...(grouped.get(id) ?? []), record]);
    }

    return grouped;
}

function indexById<TRecord>(
    records: TRecord[],
    getId: (record: TRecord) => string,
) {
    const indexed = new Map<string, TRecord>();

    for (const record of records) {
        indexed.set(getId(record), record);
    }

    return indexed;
}

function toPublicLedgerIntegrityTransactionLine(
    line: LedgerIntegrityTransactionLine,
): LedgerIntegrityTransactionLine {
    return {
        ...line,
        categoryId: toPublicTransactionLineCategoryId(line.categoryId),
        fromAccountId: toPublicTransactionLineFromAccountId(line.fromAccountId),
        toAccountId: toPublicTransactionLineToAccountId(line.toAccountId),
    };
}

function toPublicLedgerIntegrityTransaction(
    transaction: LedgerIntegrityTransaction,
): LedgerIntegrityTransaction {
    const publicTransaction = { ...transaction };
    const referenceCategoryId = toVisibleReferenceCategoryId(
        transaction.referenceCategoryId,
    );

    if (referenceCategoryId) {
        publicTransaction.referenceCategoryId = referenceCategoryId;
    } else {
        delete publicTransaction.referenceCategoryId;
    }

    return publicTransaction;
}

function comparePostingKey(posting: PostingComparison) {
    return [
        posting.ledgerAccountKind,
        posting.ledgerAccountId,
        posting.direction,
    ].join(":");
}

function groupComparablePostings(postings: PostingComparison[]) {
    return new Map(
        groupTransactionPostingInputs(postings).map((posting) => [
            comparePostingKey(posting),
            posting,
        ]),
    );
}

function formatPostingLabel(posting: PostingComparison) {
    return `${posting.direction} ${posting.ledgerAccountKind}:${posting.ledgerAccountId}`;
}

function getFindingTransactionId(finding: LedgerIntegrityFinding) {
    if (finding.entityType === "transaction" && finding.entityId) {
        return finding.entityId;
    }

    return finding.transactionId;
}

function isUncategorizedAccountActivityLine(
    line: LedgerIntegrityTransactionLine,
) {
    return (
        (line.fromAccountId || line.toAccountId) &&
        !(line.fromAccountId && line.toAccountId) &&
        !line.categoryId
    );
}

function usesSystemEquityBalancing(input: {
    lines: LedgerIntegrityTransactionLine[];
    transaction?: LedgerIntegrityTransaction;
}) {
    return (
        input.transaction?.kind === "adjustment" ||
        input.lines.some(isUncategorizedAccountActivityLine)
    );
}

function formatTransactionSummary(transaction: LedgerIntegrityTransaction) {
    const payee = transaction.payee?.trim() || "Transaction";

    return `${formatTransactionDisplayDate(
        transaction.occurredAt,
    )} - ${payee} - ${formatUsd(transaction.displayAmountCents)}`;
}

function enrichTransactionFindingSummaries(input: {
    findings: LedgerIntegrityFinding[];
    transactionById: Map<string, LedgerIntegrityTransaction>;
}) {
    return input.findings.map((finding) => {
        const transactionId = getFindingTransactionId(finding);

        if (!transactionId) {
            return finding;
        }

        const transaction = input.transactionById.get(transactionId);

        if (!transaction) {
            return finding;
        }

        return {
            ...finding,
            transactionId,
            transactionSummary: formatTransactionSummary(transaction),
        };
    });
}

function formatFindingSubject(finding: LedgerIntegrityFinding) {
    if (finding.entityType === "transaction" && finding.transactionSummary) {
        return `transaction ${finding.transactionSummary}`;
    }

    return finding.entityType
        ? `${finding.entityType}${finding.entityId ? ` ${finding.entityId}` : ""}`
        : "ledger";
}

function formatFindingMessage(finding: LedgerIntegrityFinding) {
    const transactionId = getFindingTransactionId(finding);

    if (!transactionId || !finding.transactionSummary) {
        return finding.message;
    }

    return finding.message.replaceAll(transactionId, finding.transactionSummary);
}

function getPeriodBounds(periodId: string): MonthlyPeriod | null {
    try {
        return getMonthlyPeriodBounds(periodId);
    } catch {
        return null;
    }
}

function isValidDateKey(value: string) {
    if (!dateKeyPattern.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
        return false;
    }

    return date.toISOString().slice(0, 10) === value;
}

function getBalanceAssetCents(balanceCents: number) {
    return balanceCents > 0 ? balanceCents : 0;
}

function getBalanceLiabilityCents(balanceCents: number) {
    return balanceCents < 0 ? Math.abs(balanceCents) : 0;
}

function buildBalanceTotals(
    balances: Iterable<{ balanceCents: number; openingBalanceCents?: number }>,
): LedgerIntegrityReconciliationTotals {
    let assetBalanceCents = 0;
    let liabilityBalanceCents = 0;
    let openingBalanceCents = 0;
    let currentBalanceCents = 0;

    for (const balance of balances) {
        assetBalanceCents += getBalanceAssetCents(balance.balanceCents);
        liabilityBalanceCents += getBalanceLiabilityCents(
            balance.balanceCents,
        );
        openingBalanceCents += balance.openingBalanceCents ?? 0;
        currentBalanceCents += balance.balanceCents;
    }

    return {
        assetBalanceCents,
        currentBalanceCents,
        liabilityBalanceCents,
        openingBalanceCents,
        postingDeltaCents: currentBalanceCents - openingBalanceCents,
    };
}

function checkDuplicates<TRecord>(input: {
    entityType: LedgerIntegrityFinding["entityType"];
    findings: LedgerIntegrityFinding[];
    getId: (record: TRecord) => string;
    records: TRecord[];
}) {
    const grouped = groupById(input.records, input.getId);

    for (const [id, matches] of grouped.entries()) {
        if (matches.length > 1) {
            addFinding(input.findings, {
                code: "duplicate_record_id",
                entityId: id,
                entityType: input.entityType,
                message: `${input.entityType} ${id} appears ${matches.length} times in the ledger read set.`,
                severity: "error",
            });
        }
    }
}

function compareAccountsByName(
    left: LedgerIntegrityAccount,
    right: LedgerIntegrityAccount,
) {
    const nameComparison = left.name.localeCompare(right.name);

    return nameComparison === 0
        ? left.accountId.localeCompare(right.accountId)
        : nameComparison;
}

function compareBudgetPeriods(
    left: LedgerIntegrityBudgetPeriod,
    right: LedgerIntegrityBudgetPeriod,
) {
    return left.periodId.localeCompare(right.periodId);
}

function listBudgetReconciliationPeriodIds(records: LedgerIntegrityRecords) {
    return Array.from(
        new Set([
            ...records.budgetPeriods.map((period) => period.periodId),
            ...records.budgetAllocations.map((allocation) => allocation.periodId),
            ...records.transactions.map((transaction) => transaction.periodId),
            ...records.accounts.flatMap((account) => {
                try {
                    return [getMonthlyPeriodId(account.openedOn)];
                } catch {
                    return [];
                }
            }),
        ]),
    ).sort();
}

function groupFinancialPostingsByLedgerAccountId(
    postings: LedgerIntegrityPosting[],
) {
    const grouped = new Map<string, LedgerIntegrityPosting[]>();

    for (const posting of postings) {
        if (posting.ledgerAccountKind !== "financial") {
            continue;
        }

        grouped.set(posting.ledgerAccountId, [
            ...(grouped.get(posting.ledgerAccountId) ?? []),
            posting,
        ]);
    }

    return grouped;
}

function getAccountCurrentBalance(
    account: LedgerIntegrityAccount,
    postings: LedgerIntegrityPosting[],
) {
    return calculateAccountBalanceCents(account, postings);
}

function getAccountPeriodBalance(input: {
    account: LedgerIntegrityAccount;
    asOf: string;
    postings: LedgerIntegrityPosting[];
}) {
    return calculateAccountBalanceCents(
        input.account,
        input.postings,
        input.asOf,
    );
}

function buildAccountBalanceSummary(input: {
    account: LedgerIntegrityAccount;
    balanceCents: number;
}): LedgerIntegrityAccountBalance {
    return {
        accountId: input.account.accountId,
        accountName: input.account.name,
        accountType: input.account.accountType,
        currentBalanceCents: input.balanceCents,
        ledgerAccountId: input.account.ledgerAccountId,
        openedOn: input.account.openedOn,
        openingBalanceCents: input.account.openingBalanceCents,
        postingDeltaCents:
            input.balanceCents - input.account.openingBalanceCents,
    };
}

function checkAccountReconciliation(input: {
    account: LedgerIntegrityAccount;
    findings: LedgerIntegrityFinding[];
}) {
    const { account, findings } = input;

    if (!isValidDateKey(account.openedOn)) {
        addFinding(findings, {
            code: "account_opened_on_invalid",
            entityId: account.accountId,
            entityType: "account",
            message: `Account ${account.name} has invalid openedOn date ${account.openedOn}.`,
            severity: "error",
        });
    }
}

function buildLedgerReconciliation(input: {
    findings: LedgerIntegrityFinding[];
    postingsByTransactionId: Map<string, LedgerIntegrityPosting[]>;
    records: LedgerIntegrityRecords;
    transactionById: Map<string, LedgerIntegrityTransaction>;
}): LedgerIntegrityReconciliation {
    const accounts = [...input.records.accounts].sort(compareAccountsByName);
    const postingsByLedgerAccountId = groupFinancialPostingsByLedgerAccountId(
        input.records.ledgerPostings,
    );
    const accountBalances = accounts.map((account) => {
        checkAccountReconciliation({
            account,
            findings: input.findings,
        });

        return buildAccountBalanceSummary({
            account,
            balanceCents: getAccountCurrentBalance(
                account,
                postingsByLedgerAccountId.get(account.ledgerAccountId) ?? [],
            ),
        });
    });
    const periods = [...input.records.budgetPeriods]
        .sort(compareBudgetPeriods)
        .map((period) => {
            const periodAccountBalances = accounts.map((account) => ({
                accountId: account.accountId,
                accountName: account.name,
                balanceCents: getAccountPeriodBalance({
                    account,
                    asOf: period.endsOn,
                    postings:
                        postingsByLedgerAccountId.get(account.ledgerAccountId) ??
                        [],
                }),
            }));
            const netBalanceCents = periodAccountBalances.reduce(
                (total, balance) => total + balance.balanceCents,
                0,
            );
            const assetBalanceCents = periodAccountBalances.reduce(
                (total, balance) =>
                    total + getBalanceAssetCents(balance.balanceCents),
                0,
            );
            const liabilityBalanceCents = periodAccountBalances.reduce(
                (total, balance) =>
                    total + getBalanceLiabilityCents(balance.balanceCents),
                0,
            );

            return {
                accountBalances: periodAccountBalances,
                assetBalanceCents,
                endsOn: period.endsOn,
                liabilityBalanceCents,
                netBalanceCents,
                periodId: period.periodId,
                startsOn: period.startsOn,
            };
        });

    return {
        accounts: accountBalances,
        periods,
        totals: buildBalanceTotals(
            accountBalances.map((account) => ({
                balanceCents: account.currentBalanceCents,
                openingBalanceCents: account.openingBalanceCents,
            })),
        ),
    };
}

function checkLineShape(input: {
    accountById: Map<string, LedgerIntegrityAccount>;
    categoryById: Map<string, LedgerIntegrityBudgetCategory>;
    findings: LedgerIntegrityFinding[];
    line: LedgerIntegrityTransactionLine;
    transaction?: LedgerIntegrityTransaction;
}) {
    const { findings, line, transaction } = input;

    if (!transaction) {
        addFinding(findings, {
            code: "transaction_line_orphaned",
            entityId: line.lineId,
            entityType: "transactionLine",
            message: `Transaction line ${line.lineId} references missing transaction ${line.transactionId}.`,
            relatedEntityIds: [line.transactionId],
            severity: "error",
        });
    }

    if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) {
        addFinding(findings, {
            actualCents: line.amountCents,
            code: "transaction_line_invalid_amount",
            entityId: line.lineId,
            entityType: "transactionLine",
            message: `Transaction line ${line.lineId} has a non-positive amount.`,
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (line.fromAccountId && !input.accountById.has(line.fromAccountId)) {
        addFinding(findings, {
            code: "transaction_line_missing_from_account",
            entityId: line.lineId,
            entityType: "transactionLine",
            message: `Transaction line ${line.lineId} references missing from-account ${line.fromAccountId}.`,
            relatedEntityIds: [line.fromAccountId],
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (line.toAccountId && !input.accountById.has(line.toAccountId)) {
        addFinding(findings, {
            code: "transaction_line_missing_to_account",
            entityId: line.lineId,
            entityType: "transactionLine",
            message: `Transaction line ${line.lineId} references missing to-account ${line.toAccountId}.`,
            relatedEntityIds: [line.toAccountId],
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (line.categoryId && !input.categoryById.has(line.categoryId)) {
        addFinding(findings, {
            code: "transaction_line_missing_category",
            entityId: line.lineId,
            entityType: "transactionLine",
            message: `Transaction line ${line.lineId} references missing category ${line.categoryId}.`,
            relatedEntityIds: [line.categoryId],
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (!line.fromAccountId && !line.toAccountId) {
        addFinding(findings, {
            code: "transaction_line_missing_account",
            entityId: line.lineId,
            entityType: "transactionLine",
            message: `Transaction line ${line.lineId} does not reference an account.`,
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (line.fromAccountId && line.toAccountId && line.categoryId) {
        addFinding(findings, {
            code: "transaction_line_transfer_has_category",
            entityId: line.lineId,
            entityType: "transactionLine",
            message: `Transaction line ${line.lineId} is both a transfer and a category line.`,
            relatedEntityIds: [line.categoryId],
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (
        line.fromAccountId &&
        line.toAccountId &&
        line.fromAccountId === line.toAccountId
    ) {
        addFinding(findings, {
            code: "transaction_line_self_transfer",
            entityId: line.lineId,
            entityType: "transactionLine",
            message: `Transaction line ${line.lineId} transfers to and from the same account.`,
            relatedEntityIds: [line.fromAccountId],
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (transaction?.kind === "adjustment") {
        const accountCount = Number(Boolean(line.fromAccountId)) +
            Number(Boolean(line.toAccountId));

        if (accountCount !== 1) {
            addFinding(findings, {
                code: "adjustment_line_invalid_shape",
                entityId: line.lineId,
                entityType: "transactionLine",
                message: `Adjustment line ${line.lineId} must have exactly one account.`,
                severity: "error",
                transactionId: transaction.transactionId,
            });
        }
    }
}

function buildExpectedPostingsForLines(input: {
    accountById: Map<string, LedgerIntegrityAccount>;
    categoryById: Map<string, LedgerIntegrityBudgetCategory>;
    lines: LedgerIntegrityTransactionLine[];
}) {
    return input.lines.flatMap((line) => {
        const fromAccount = line.fromAccountId
            ? input.accountById.get(line.fromAccountId)
            : null;
        const toAccount = line.toAccountId
            ? input.accountById.get(line.toAccountId)
            : null;
        const category = line.categoryId
            ? input.categoryById.get(line.categoryId)
            : null;

        try {
            return buildTransactionLinePostingInputs({
                amountCents: line.amountCents,
                categoryLedgerAccountId: category?.ledgerAccountId,
                fromLedgerAccountId: fromAccount?.ledgerAccountId,
                toLedgerAccountId: toAccount?.ledgerAccountId,
                uncategorizedEquityLedgerAccountId:
                    UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID,
            });
        } catch {
            return [];
        }
    });
}

function checkPostingReferences(input: {
    accountByLedgerAccountId: Map<string, LedgerIntegrityAccount>;
    allowsSystemEquityPosting: boolean;
    categoryByLedgerAccountId: Map<string, LedgerIntegrityBudgetCategory>;
    findings: LedgerIntegrityFinding[];
    posting: LedgerIntegrityPosting;
    transaction?: LedgerIntegrityTransaction;
}) {
    const { findings, posting, transaction } = input;

    if (!transaction) {
        addFinding(findings, {
            code: "ledger_posting_orphaned",
            entityId: posting.postingId,
            entityType: "ledgerPosting",
            message: `Ledger posting ${posting.postingId} references missing transaction ${posting.transactionId}.`,
            relatedEntityIds: [posting.transactionId],
            severity: "error",
        });
    }

    if (!Number.isInteger(posting.amountCents) || posting.amountCents <= 0) {
        addFinding(findings, {
            actualCents: posting.amountCents,
            code: "ledger_posting_invalid_amount",
            entityId: posting.postingId,
            entityType: "ledgerPosting",
            message: `Ledger posting ${posting.postingId} has a non-positive amount.`,
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (
        posting.ledgerAccountKind === "financial" &&
        !input.accountByLedgerAccountId.has(posting.ledgerAccountId)
    ) {
        addFinding(findings, {
            code: "ledger_posting_missing_financial_account",
            entityId: posting.postingId,
            entityType: "ledgerPosting",
            message: `Ledger posting ${posting.postingId} references missing financial ledger account ${posting.ledgerAccountId}.`,
            relatedEntityIds: [posting.ledgerAccountId],
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (
        posting.ledgerAccountKind === "category" &&
        !input.categoryByLedgerAccountId.has(posting.ledgerAccountId)
    ) {
        addFinding(findings, {
            code: "ledger_posting_missing_category_account",
            entityId: posting.postingId,
            entityType: "ledgerPosting",
            message: `Ledger posting ${posting.postingId} references missing category ledger account ${posting.ledgerAccountId}.`,
            relatedEntityIds: [posting.ledgerAccountId],
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (
        posting.ledgerAccountKind === "equity" &&
        !input.allowsSystemEquityPosting
    ) {
        addFinding(findings, {
            code: "ledger_posting_unknown_equity_account",
            entityId: posting.postingId,
            entityType: "ledgerPosting",
            message: `Ledger posting ${posting.postingId} references unsupported equity account ${posting.ledgerAccountId}.`,
            relatedEntityIds: [posting.ledgerAccountId],
            severity: "error",
            transactionId: transaction?.transactionId,
        });
    }

    if (transaction && posting.periodId !== transaction.periodId) {
        addFinding(findings, {
            code: "ledger_posting_period_mismatch",
            entityId: posting.postingId,
            entityType: "ledgerPosting",
            message: `Ledger posting ${posting.postingId} period ${posting.periodId} does not match transaction period ${transaction.periodId}.`,
            relatedEntityIds: [transaction.transactionId],
            severity: "error",
            transactionId: transaction.transactionId,
        });
    }

    if (transaction && posting.occurredAt !== transaction.occurredAt) {
        addFinding(findings, {
            code: "ledger_posting_date_mismatch",
            entityId: posting.postingId,
            entityType: "ledgerPosting",
            message: `Ledger posting ${posting.postingId} date does not match transaction ${transaction.transactionId}.`,
            relatedEntityIds: [transaction.transactionId],
            severity: "error",
            transactionId: transaction.transactionId,
        });
    }
}

function checkTransactionAccounting(input: {
    accountById: Map<string, LedgerIntegrityAccount>;
    categoryById: Map<string, LedgerIntegrityBudgetCategory>;
    findings: LedgerIntegrityFinding[];
    lines: LedgerIntegrityTransactionLine[];
    postings: LedgerIntegrityPosting[];
    transaction: LedgerIntegrityTransaction;
}) {
    const { findings, lines, postings, transaction } = input;
    const referenceAccount = input.accountById.get(transaction.referenceAccountId);
    const hasSystemEquityBalancing = usesSystemEquityBalancing({
        lines,
        transaction,
    });

    if (transaction.periodId !== getMonthlyPeriodId(transaction.occurredAt)) {
        addFinding(findings, {
            code: "transaction_period_mismatch",
            entityId: transaction.transactionId,
            entityType: "transaction",
            message: `Transaction ${transaction.transactionId} period ${transaction.periodId} does not match occurredAt ${transaction.occurredAt}.`,
            expectedCents: undefined,
            severity: "error",
            transactionId: transaction.transactionId,
        });
    }

    if (!referenceAccount) {
        addFinding(findings, {
            code: "transaction_missing_reference_account",
            entityId: transaction.transactionId,
            entityType: "transaction",
            message: `Transaction ${transaction.transactionId} references missing account ${transaction.referenceAccountId}.`,
            relatedEntityIds: [transaction.referenceAccountId],
            severity: "error",
            transactionId: transaction.transactionId,
        });
    }

    if (
        transaction.referenceCategoryId &&
        !input.categoryById.has(transaction.referenceCategoryId)
    ) {
        addFinding(findings, {
            code: "transaction_missing_reference_category",
            entityId: transaction.transactionId,
            entityType: "transaction",
            message: `Transaction ${transaction.transactionId} references missing category ${transaction.referenceCategoryId}.`,
            relatedEntityIds: [transaction.referenceCategoryId],
            severity: "error",
            transactionId: transaction.transactionId,
        });
    }

    if (transaction.status === "voided") {
        if (lines.length > 0 || postings.length > 0) {
            addFinding(findings, {
                code: "voided_transaction_has_children",
                entityId: transaction.transactionId,
                entityType: "transaction",
                message: `Voided transaction ${transaction.transactionId} still has ${lines.length} lines and ${postings.length} postings.`,
                severity: "error",
                transactionId: transaction.transactionId,
            });
        }

        return;
    }

    if (lines.length === 0) {
        addFinding(findings, {
            code: "transaction_missing_lines",
            entityId: transaction.transactionId,
            entityType: "transaction",
            message: `Transaction ${transaction.transactionId} has no transaction lines.`,
            severity: "error",
            transactionId: transaction.transactionId,
        });
    }

    try {
        assertValidTransactionPostings({ postings });
    } catch (error) {
        addFinding(findings, {
            code: "transaction_postings_invalid",
            entityId: transaction.transactionId,
            entityType: "transaction",
            message: `Transaction ${transaction.transactionId} has invalid postings: ${
                error instanceof Error ? error.message : String(error)
            }`,
            severity: "error",
            transactionId: transaction.transactionId,
        });
    }

    if (referenceAccount) {
        const displayAmountCents = getFinancialPostingDeltaForLedgerAccount({
            ledgerAccountId: referenceAccount.ledgerAccountId,
            postings,
        });

        if (displayAmountCents === null) {
            addFinding(findings, {
                code: "transaction_reference_account_without_posting",
                entityId: transaction.transactionId,
                entityType: "transaction",
                message: `Transaction ${transaction.transactionId} has no financial posting for reference account ${transaction.referenceAccountId}.`,
                relatedEntityIds: [transaction.referenceAccountId],
                severity: "error",
                transactionId: transaction.transactionId,
            });
        } else if (displayAmountCents !== transaction.displayAmountCents) {
            addFinding(findings, {
                actualCents: transaction.displayAmountCents,
                code: "transaction_display_amount_mismatch",
                entityId: transaction.transactionId,
                entityType: "transaction",
                expectedCents: displayAmountCents,
                message: `Transaction ${transaction.transactionId} display amount does not match reference account posting movement.`,
                relatedEntityIds: [transaction.referenceAccountId],
                severity: "error",
                transactionId: transaction.transactionId,
            });
        }
    }

    if (hasSystemEquityBalancing) {
        return;
    }

    const expectedPostings = groupComparablePostings(
        buildExpectedPostingsForLines({
            accountById: input.accountById,
            categoryById: input.categoryById,
            lines,
        }),
    );
    const actualPostings = groupComparablePostings(postings);
    const postingKeys = new Set([
        ...expectedPostings.keys(),
        ...actualPostings.keys(),
    ]);

    for (const postingKey of postingKeys) {
        const expected = expectedPostings.get(postingKey);
        const actual = actualPostings.get(postingKey);

        if ((expected?.amountCents ?? 0) !== (actual?.amountCents ?? 0)) {
            addFinding(findings, {
                actualCents: actual?.amountCents ?? 0,
                code: "transaction_line_posting_mismatch",
                entityId: transaction.transactionId,
                entityType: "transaction",
                expectedCents: expected?.amountCents ?? 0,
                message: `Transaction ${transaction.transactionId} line-derived posting ${formatPostingLabel(
                    expected ?? actual!,
                )} does not match stored postings.`,
                severity: "error",
                transactionId: transaction.transactionId,
            });
        }
    }
}

function checkBudgetAllocations(input: {
    findings: LedgerIntegrityFinding[];
    records: LedgerIntegrityRecords;
}) {
    const { findings, records } = input;
    const categoryById = indexById(
        records.budgetCategories,
        (category) => category.categoryId,
    );

    for (const allocation of records.budgetAllocations) {
        const category = categoryById.get(allocation.categoryId);

        if (!getPeriodBounds(allocation.periodId)) {
            addFinding(findings, {
                code: "budget_allocation_invalid_period",
                entityId: allocation.allocationId,
                entityType: "budgetAllocation",
                message: `Budget allocation ${allocation.allocationId} uses invalid period ${allocation.periodId}.`,
                severity: "error",
            });
        }

        if (allocation.allocationId !== `${allocation.periodId}:${allocation.categoryId}`) {
            addFinding(findings, {
                code: "budget_allocation_id_mismatch",
                entityId: allocation.allocationId,
                entityType: "budgetAllocation",
                message: `Budget allocation ${allocation.allocationId} does not match period/category identity.`,
                severity: "error",
            });
        }

        if (!category) {
            addFinding(findings, {
                code: "budget_allocation_missing_category",
                entityId: allocation.allocationId,
                entityType: "budgetAllocation",
                message: `Budget allocation ${allocation.allocationId} references missing category ${allocation.categoryId}.`,
                relatedEntityIds: [allocation.categoryId],
                severity: "error",
            });
            continue;
        }
    }
}

function checkBudgetPeriods(input: {
    findings: LedgerIntegrityFinding[];
    records: LedgerIntegrityRecords;
}) {
    const { findings, records } = input;

    for (const period of records.budgetPeriods) {
        const bounds = getPeriodBounds(period.periodId);

        if (!bounds) {
            addFinding(findings, {
                code: "budget_period_invalid_id",
                entityId: period.periodId,
                entityType: "budgetPeriod",
                message: `Budget period ${period.periodId} is not a valid monthly period id.`,
                severity: "error",
            });
            continue;
        }

        if (period.startsOn !== bounds.startsOn || period.endsOn !== bounds.endsOn) {
            addFinding(findings, {
                code: "budget_period_bounds_mismatch",
                entityId: period.periodId,
                entityType: "budgetPeriod",
                message: `Budget period ${period.periodId} date bounds do not match its period id.`,
                severity: "error",
            });
        }

        // availableToBudgetCents is a retained compatibility field. Budget
        // reads derive the current value from ledger and allocation state.
    }
}

function checkBudgetAllocationSourceReconciliation(input: {
    findings: LedgerIntegrityFinding[];
    records: LedgerIntegrityRecords;
}) {
    if (
        input.findings.some((finding) =>
            BUDGET_ALLOCATION_SOURCE_BLOCKING_CODES.has(finding.code),
        )
    ) {
        return;
    }

    const visibleCategoryIds = new Set(
        input.records.budgetCategories
            .filter(isUserVisibleBudgetCategory)
            .map((category) => category.categoryId),
    );

    for (const periodId of listBudgetReconciliationPeriodIds(input.records)) {
        const bounds = getPeriodBounds(periodId);

        if (!bounds) {
            continue;
        }

        const assignedAllocationTotalCents = input.records.budgetAllocations
            .filter(
                (allocation) =>
                    allocation.periodId === periodId &&
                    visibleCategoryIds.has(allocation.categoryId),
            )
            .reduce(
                (total, allocation) => total + allocation.assignedCents,
                0,
            );
        const allocationFundingCents = listOpeningBalanceFundingRowsForPeriod({
            accounts: input.records.accounts,
            periodId,
        }).reduce((total, row) => total + row.amountCents, 0);
        const allocationDifferenceCents =
            allocationFundingCents - assignedAllocationTotalCents;

        if (allocationDifferenceCents !== 0) {
            addFinding(input.findings, {
                actualCents: assignedAllocationTotalCents,
                code: "budget_allocation_source_mismatch",
                entityId: periodId,
                entityType: "budgetPeriod",
                expectedCents: allocationFundingCents,
                message: `Budget period ${periodId} has ${formatUsd(
                    allocationFundingCents,
                )} in projected opening-balance funding but ${formatUsd(
                    assignedAllocationTotalCents,
                )} in visible category assignments. The allocation difference is ${formatUsd(
                    allocationDifferenceCents,
                )}.`,
                severity: "warning",
            });
        }
    }
}

export function checkLedgerIntegrityRecords(
    records: LedgerIntegrityRecords,
): LedgerIntegrityCheckResult {
    const normalizedRecords: LedgerIntegrityRecords = {
        ...records,
        transactionLines: records.transactionLines.map(
            toPublicLedgerIntegrityTransactionLine,
        ),
        transactions: records.transactions.map(toPublicLedgerIntegrityTransaction),
    };
    const findings: LedgerIntegrityFinding[] = [];
    const accountById = indexById(
        normalizedRecords.accounts,
        (account) => account.accountId,
    );
    const accountByLedgerAccountId = indexById(
        normalizedRecords.accounts,
        (account) => account.ledgerAccountId,
    );
    const categoryById = indexById(
        normalizedRecords.budgetCategories,
        (category) => category.categoryId,
    );
    const categoryByLedgerAccountId = indexById(
        normalizedRecords.budgetCategories,
        (category) => category.ledgerAccountId,
    );
    const transactionById = indexById(
        normalizedRecords.transactions,
        (transaction) => transaction.transactionId,
    );
    const linesByTransactionId = groupById(
        normalizedRecords.transactionLines,
        (line) => line.transactionId,
    );
    const postingsByTransactionId = groupById(
        normalizedRecords.ledgerPostings,
        (posting) => posting.transactionId,
    );

    checkDuplicates({
        entityType: "account",
        findings,
        getId: (account: LedgerIntegrityAccount) => account.accountId,
        records: normalizedRecords.accounts,
    });
    checkDuplicates({
        entityType: "budgetCategory",
        findings,
        getId: (category: LedgerIntegrityBudgetCategory) => category.categoryId,
        records: normalizedRecords.budgetCategories,
    });
    checkDuplicates({
        entityType: "budgetAllocation",
        findings,
        getId: (allocation: LedgerIntegrityBudgetAllocation) =>
            allocation.allocationId,
        records: normalizedRecords.budgetAllocations,
    });
    checkDuplicates({
        entityType: "transaction",
        findings,
        getId: (transaction: LedgerIntegrityTransaction) =>
            transaction.transactionId,
        records: normalizedRecords.transactions,
    });
    checkDuplicates({
        entityType: "transactionLine",
        findings,
        getId: (line: LedgerIntegrityTransactionLine) => line.lineId,
        records: normalizedRecords.transactionLines,
    });
    checkDuplicates({
        entityType: "ledgerPosting",
        findings,
        getId: (posting: LedgerIntegrityPosting) => posting.postingId,
        records: normalizedRecords.ledgerPostings,
    });

    for (const line of normalizedRecords.transactionLines) {
        checkLineShape({
            accountById,
            categoryById,
            findings,
            line,
            transaction: transactionById.get(line.transactionId),
        });
    }

    for (const posting of normalizedRecords.ledgerPostings) {
        const transaction = transactionById.get(posting.transactionId);
        const lines = linesByTransactionId.get(posting.transactionId) ?? [];

        checkPostingReferences({
            accountByLedgerAccountId,
            allowsSystemEquityPosting: usesSystemEquityBalancing({
                lines,
                transaction,
            }),
            categoryByLedgerAccountId,
            findings,
            posting,
            transaction,
        });
    }

    for (const transaction of normalizedRecords.transactions) {
        checkTransactionAccounting({
            accountById,
            categoryById,
            findings,
            lines: linesByTransactionId.get(transaction.transactionId) ?? [],
            postings:
                postingsByTransactionId.get(transaction.transactionId) ?? [],
            transaction,
        });
    }

    checkBudgetAllocations({ findings, records: normalizedRecords });
    checkBudgetPeriods({ findings, records: normalizedRecords });
    const reconciliation = buildLedgerReconciliation({
        findings,
        postingsByTransactionId,
        records: normalizedRecords,
        transactionById,
    });
    checkBudgetAllocationSourceReconciliation({
        findings,
        records: normalizedRecords,
    });

    const enrichedFindings = enrichTransactionFindingSummaries({
        findings,
        transactionById,
    });
    const errorCount = enrichedFindings.filter(
        (finding) => finding.severity === "error",
    ).length;
    const warningCount = enrichedFindings.filter(
        (finding) => finding.severity === "warning",
    ).length;

    return {
        checkedAt: new Date().toISOString(),
        errorCount,
        findings: enrichedFindings,
        ledger: normalizedRecords.ledger,
        reconciliation,
        recordCounts: {
            account: normalizedRecords.accounts.length,
            budgetAllocation: normalizedRecords.budgetAllocations.length,
            budgetCategory: normalizedRecords.budgetCategories.length,
            budgetPeriod: normalizedRecords.budgetPeriods.length,
            ledgerPosting: normalizedRecords.ledgerPostings.length,
            transaction: normalizedRecords.transactions.length,
            transactionLine: normalizedRecords.transactionLines.length,
        },
        status:
            errorCount > 0 ? "failed" : warningCount > 0 ? "warning" : "passed",
        warningCount,
    };
}

export async function listLedgerIntegrityLedgers() {
    const { entities } = getBudgetedSchema();
    const ledgers = await queryAllPages(
        entities.ledgers.query.byLedger({ workspaceId: GLOBAL_WORKSPACE_ID }),
        { consistent: true },
    );

    return (ledgers as LedgerIntegrityLedger[])
        .filter((ledger) => ledger.status === "active")
        .sort(compareLedgerNames);
}

export async function resolveLedgerForIntegrityCheck(input: {
    ledgerId?: string;
    ledgerName?: string;
}) {
    const ledgers = await listLedgerIntegrityLedgers();

    if (input.ledgerId) {
        return (
            ledgers.find((ledger) => ledger.ledgerId === input.ledgerId) ?? null
        );
    }

    if (input.ledgerName) {
        const normalizedName = input.ledgerName.trim().toLowerCase();
        const matches = ledgers.filter(
            (ledger) => ledger.name.trim().toLowerCase() === normalizedName,
        );

        if (matches.length > 1) {
            throw new Error(
                `Multiple active ledgers are named "${input.ledgerName}". Use --ledger-id instead.`,
            );
        }

        return matches[0] ?? null;
    }

    throw new Error("Provide --ledger-id or --ledger-name.");
}

export async function readLedgerIntegrityRecords(
    ledger: LedgerIntegrityLedger,
): Promise<LedgerIntegrityRecords> {
    const { entities } = getBudgetedSchema();
    const [
        accounts,
        budgetAllocations,
        budgetCategories,
        budgetPeriods,
        ledgerPostings,
        transactionLines,
        transactions,
    ] = await Promise.all([
        queryAllPages(entities.accounts.query.byAccount({ ledgerId: ledger.ledgerId }), {
            consistent: true,
        }),
        queryAllPages(
            entities.categoryAllocations.query.byAllocation({
                ledgerId: ledger.ledgerId,
            }),
            { consistent: true },
        ),
        queryAllPages(
            entities.budgetCategories.query.byCategory({
                ledgerId: ledger.ledgerId,
            }),
            { consistent: true },
        ),
        queryAllPages(
            entities.budgetPeriods.query.byPeriod({ ledgerId: ledger.ledgerId }),
            { consistent: true },
        ),
        queryAllPages(
            entities.ledgerPostings.query.byPosting({
                ledgerId: ledger.ledgerId,
            }),
            { consistent: true },
        ),
        queryAllPages(
            entities.transactionLines.query.byLine({
                ledgerId: ledger.ledgerId,
            }),
            { consistent: true },
        ),
        queryAllPages(
            entities.transactions.query.byTransaction({
                ledgerId: ledger.ledgerId,
            }),
            { consistent: true },
        ),
    ]);

    return {
        accounts: accounts as LedgerIntegrityAccount[],
        budgetAllocations: budgetAllocations as LedgerIntegrityBudgetAllocation[],
        budgetCategories: budgetCategories as LedgerIntegrityBudgetCategory[],
        budgetPeriods: budgetPeriods as LedgerIntegrityBudgetPeriod[],
        ledger,
        ledgerPostings: ledgerPostings as LedgerIntegrityPosting[],
        transactionLines: transactionLines as LedgerIntegrityTransactionLine[],
        transactions: transactions as LedgerIntegrityTransaction[],
    };
}

export async function runLedgerIntegrityCheck(input: {
    ledgerId?: string;
    ledgerName?: string;
}) {
    const ledger = await resolveLedgerForIntegrityCheck(input);

    if (!ledger) {
        throw new Error("The requested active ledger could not be found.");
    }

    return checkLedgerIntegrityRecords(await readLedgerIntegrityRecords(ledger));
}

export function formatLedgerIntegrityCheckResult(
    result: LedgerIntegrityCheckResult,
) {
    const lines = [
        `Ledger integrity check: ${result.ledger.name} (${result.ledger.ledgerId})`,
        `Status: ${result.status}`,
        `Checked: ${result.checkedAt}`,
        `Records: ${Object.entries(result.recordCounts)
            .map(([entityType, count]) => `${entityType}=${count}`)
            .join(", ")}`,
        `Findings: ${result.errorCount} errors, ${result.warningCount} warnings`,
        `Reconciliation: opening=${formatUsd(
            result.reconciliation.totals.openingBalanceCents,
        )}, postingDelta=${formatUsd(
            result.reconciliation.totals.postingDeltaCents,
        )}, current=${formatUsd(
            result.reconciliation.totals.currentBalanceCents,
        )}, assets=${formatUsd(
            result.reconciliation.totals.assetBalanceCents,
        )}, liabilities=${formatUsd(
            result.reconciliation.totals.liabilityBalanceCents,
        )}`,
        "Account balances:",
        ...result.reconciliation.accounts.map(
            (account) =>
                `- ${account.accountName} (${account.accountId}): current=${formatUsd(
                    account.currentBalanceCents,
                )}, opening=${formatUsd(
                    account.openingBalanceCents,
                )}, postingDelta=${formatUsd(account.postingDeltaCents)}`,
        ),
    ];

    if (result.findings.length === 0) {
        return [...lines, "No integrity findings."];
    }

    return [
        ...lines,
        "Findings:",
        ...result.findings.map((finding) => {
            const subject = formatFindingSubject(finding);
            const amounts =
                finding.expectedCents === undefined &&
                finding.actualCents === undefined
                    ? ""
                    : ` expected=${finding.expectedCents ?? "n/a"} actual=${finding.actualCents ?? "n/a"}`;

            return `- ${finding.severity.toUpperCase()} ${finding.code} ${subject}: ${formatFindingMessage(
                finding,
            )}${amounts}`;
        }),
    ];
}
