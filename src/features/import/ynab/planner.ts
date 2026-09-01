import { createHash } from "node:crypto";

import type {
    YnabCsvExport,
    YnabPlanCsvRecord,
    YnabRegisterCsvRecord,
} from "@/features/import/ynab/csv";
import {
    MIXED_REFERENCE_CATEGORY_ID,
    UNCATEGORIZED_REFERENCE_CATEGORY_ID,
    ZERO_NET_REFERENCE_CATEGORY_ID,
} from "@/features/transactions/models/reference-category";
import {
    NO_TRANSACTION_LINE_CATEGORY_ID,
    NO_TRANSACTION_LINE_FROM_ACCOUNT_ID,
    NO_TRANSACTION_LINE_TO_ACCOUNT_ID,
} from "@/features/transactions/models/transaction-line-normalization";
import { isZeroNetMultiLineTransaction } from "@/features/transactions/models/transaction-shape";
import { groupBy } from "@/lib/collections";
import { normalizeOptionalString } from "@/lib/strings";
import type { AccountType } from "@/modules/accounts/account-types";
import {
    buildTransactionLinePostingInputs,
    getMonthlyPeriodBounds,
    getMonthlyPeriodId,
    groupTransactionPostingInputs,
    isMonthlyPeriodId,
    type TransactionPostingInput,
} from "@/modules/ledger";
import { getEffectiveBudgetCategoryDefaultAssignedCents } from "@/modules/budgeting/allocation-schedule";
import { UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID } from "@/modules/budgeting/uncategorized";

export type YnabImportRole = "budget" | "exclude" | "tracking";

export type YnabAccountMapping = {
    accountId: string;
    accountName: string;
    accountType: AccountType;
    importRole: YnabImportRole;
    reason: string;
};

export type YnabImportSummary = {
    accountCountByRole: Record<YnabImportRole, number>;
    budgetCategoryCount: number;
    budgetGroupCount: number;
    firstMonth: string | null;
    lastMonth: string | null;
    skippedSyntheticAccountCount: number;
    multiLineTransactionCount: number;
    transactionLineCount: number;
    transactionCount: number;
    warnings: YnabImportWarning[];
};

export type YnabImportWarning = {
    accountName: string;
    amountCents: number;
    categoryPath: string;
    code: "trackingCategorizedStartingBalance";
    message: string;
    rowNumber: number;
};

export type YnabImportPlan = {
    accountMappings: YnabAccountMapping[];
    records: YnabImportRecords;
    summary: YnabImportSummary;
};

export type YnabImportRecords = {
    accounts: YnabAccountRecord[];
    budgetAllocations: YnabCategoryAllocationRecord[];
    budgetCategories: YnabBudgetCategoryRecord[];
    budgetGroups: YnabBudgetGroupRecord[];
    budgetPeriods: YnabBudgetPeriodRecord[];
    ledgerPostings: YnabLedgerPostingRecord[];
    transactionLines: YnabTransactionLineRecord[];
    transactions: YnabTransactionRecord[];
};

export type YnabImportBuildInput = {
    accountMappings?: YnabAccountMapping[];
    endMonth?: string;
    export: YnabCsvExport;
    ledgerId: string;
    now?: string;
};

export type YnabAccountRecord = {
    accountId: string;
    accountType: AccountType;
    createdAt: string;
    ledgerAccountId: string;
    name: string;
    openedOn: string;
    openingBalanceCents: number;
    updatedAt: string;
    ledgerId: string;
};

export type YnabBudgetGroupRecord = {
    createdAt: string;
    groupId: string;
    name: string;
    sortOrder: number;
    status: "active";
    updatedAt: string;
    ledgerId: string;
};

export type YnabBudgetCategoryRecord = {
    allocationCadence: "monthly";
    allocationStartMonth: 1;
    categoryId: string;
    createdAt: string;
    defaultAssignedCents: number;
    groupId: string;
    isIncomeCategory: boolean;
    ledgerAccountId: string;
    name: string;
    sortOrder: number;
    status: "active";
    updatedAt: string;
    ledgerId: string;
};

export type YnabBudgetPeriodRecord = {
    availableToBudgetCents?: number;
    carryForwardFromPeriodId?: string;
    createdAt: string;
    currency: "USD";
    endsOn: string;
    periodId: string;
    startsOn: string;
    status: "open";
    updatedAt: string;
    ledgerId: string;
};

export type YnabCategoryAllocationRecord = {
    allocationId: string;
    assignedCents: number;
    categoryId: string;
    periodId: string;
    updatedAt: string;
    ledgerId: string;
};

export type YnabTransactionRecord = {
    displayAmountCents: number;
    enteredAt: string;
    kind: "adjustment" | "standard";
    memo?: string;
    occurredAt: string;
    payee?: string;
    periodId: string;
    referenceAccountId: string;
    referenceCategoryId?: string;
    source: "manual";
    status: "cleared" | "entered" | "reconciled";
    transactionId: string;
    updatedAt: string;
    ledgerId: string;
};

export type YnabTransactionLineRecord = {
    amountCents: number;
    categoryId?: string;
    createdAt: string;
    fromAccountId?: string;
    lineId: string;
    memo?: string;
    payee?: string;
    sortOrder: number;
    transactionId: string;
    toAccountId?: string;
    updatedAt: string;
    ledgerId: string;
};

export type YnabLedgerPostingRecord = {
    amountCents: number;
    createdAt: string;
    direction: "credit" | "debit";
    ledgerAccountId: string;
    ledgerAccountKind: "category" | "equity" | "financial";
    occurredAt: string;
    periodId: string;
    postingId: string;
    transactionId: string;
    ledgerId: string;
};

type NormalizedPlanRow = {
    activityCents: number;
    assignedCents: number;
    availableCents: number;
    categoryName: string;
    groupName: string;
    periodId: string;
    rowIndex: number;
};

type SplitMarker = {
    index: number;
    total: number;
};

type NormalizedRegisterRow = {
    accountName: string;
    amountCents: number;
    categoryName: string;
    cleanedMemo?: string;
    cleared: string;
    date: string;
    groupName: string;
    inflowCents: number;
    memo: string;
    occurredAt: string;
    outflowCents: number;
    payee: string;
    periodId: string;
    rowIndex: number;
    splitMarker?: SplitMarker;
    transferTargetAccountName?: string;
};

type CategoryLookup = {
    category: YnabBudgetCategoryRecord;
};

type TransactionBuildContext = {
    accountByName: Map<string, YnabAccountRecord>;
    accountMappingByName: Map<string, YnabAccountMapping>;
    categoryByKey: Map<string, CategoryLookup>;
    ledgerId: string;
    now: string;
};

type TransactionBuildResult = {
    ledgerPostings: YnabLedgerPostingRecord[];
    multiLineTransactionCount: number;
    transactionLines: YnabTransactionLineRecord[];
    transactions: YnabTransactionRecord[];
};

function getRegisterCsvRowNumber(row: Pick<NormalizedRegisterRow, "rowIndex">) {
    return row.rowIndex + 2;
}

function getImportedAccount(input: {
    accountName: string;
    context: TransactionBuildContext;
    missingMessage: string;
}) {
    const account = input.context.accountByName.get(input.accountName);

    if (!account) {
        throw new Error(input.missingMessage);
    }

    return account;
}

const CREDIT_CARD_PAYMENTS_GROUP = "Credit Card Payments";
const SYNTHETIC_ACCOUNT_NAMES = new Set([
    "Monthly Rollovers",
    "Start of Year Transfers",
    "Transfers",
]);
const MONTH_NUMBERS = new Map(
    [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
    ].map((month, index) => [month, index + 1]),
);

function normalizeDisplayName(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
    return normalizeDisplayName(value).toLowerCase();
}

function categoryKey(groupName: string, categoryName: string) {
    return `${normalizeKey(groupName)}::${normalizeKey(categoryName)}`;
}

function stableId(prefix: string, parts: unknown[]) {
    const hash = createHash("sha1")
        .update(JSON.stringify(parts))
        .digest("hex")
        .slice(0, 24);

    return `${prefix}_${hash}`;
}

function pad(value: number) {
    return String(value).padStart(2, "0");
}

function parseMoneyCents(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
        return 0;
    }

    const isParenthesizedNegative =
        trimmed.startsWith("(") && trimmed.endsWith(")");
    const isNegative = trimmed.includes("-") || isParenthesizedNegative;
    const normalized = trimmed.replace(/[$,\-()]/g, "");
    const amount = Number(normalized);

    if (!Number.isFinite(amount)) {
        throw new Error(`Could not parse money value: ${value}`);
    }

    const cents = Math.round(amount * 100);

    return isNegative ? -cents : cents;
}

function formatCents(cents: number) {
    return (cents / 100).toLocaleString("en-US", {
        currency: "USD",
        style: "currency",
    });
}

function parseMonthLabel(value: string) {
    const match = /^([A-Za-z]{3,})\s+(\d{4})$/.exec(value.trim());

    if (!match) {
        throw new Error(`Could not parse YNAB month label: ${value}`);
    }

    const monthNumber = MONTH_NUMBERS.get(match[1].slice(0, 3).toLowerCase());
    const year = Number(match[2]);

    if (!monthNumber) {
        throw new Error(`Could not parse YNAB month label: ${value}`);
    }

    return `${year}-${pad(monthNumber)}`;
}

function parseRegisterDate(value: string) {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());

    if (!match) {
        throw new Error(`Could not parse YNAB register date: ${value}`);
    }

    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error(`Could not parse YNAB register date: ${value}`);
    }

    return date.toISOString();
}

function getIsoDate(occurredAt: string) {
    return occurredAt.slice(0, 10);
}

function parseSplitMarker(memo: string): SplitMarker | undefined {
    const match = /\bSplit\s*\((\d+)\/(\d+)\)/i.exec(memo);

    if (!match) {
        return undefined;
    }

    const index = Number(match[1]);
    const total = Number(match[2]);

    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1) {
        throw new Error(`Could not parse split marker: ${memo}`);
    }

    return { index, total };
}

function stripSplitMarker(memo: string) {
    const stripped = memo.replace(/\bSplit\s*\(\d+\/\d+\)\s*/i, "").trim();

    return stripped ? stripped : undefined;
}

function parseTransferTarget(payee: string) {
    const match = /^Transfer\s*:\s*(.+)$/i.exec(payee.trim());

    return match ? normalizeDisplayName(match[1]) : undefined;
}

function isStartingBalance(row: Pick<NormalizedRegisterRow, "payee">) {
    return normalizeKey(row.payee) === "starting balance";
}

function isReadyToAssign(input: {
    categoryName: string;
    groupName: string;
}) {
    return (
        normalizeKey(input.groupName) === "inflow" &&
        normalizeKey(input.categoryName) === "ready to assign"
    );
}

function getCategoryPath(input: {
    categoryName: string;
    groupName: string;
}) {
    if (!input.groupName || !input.categoryName) {
        return undefined;
    }

    return `${input.groupName}: ${input.categoryName}`;
}

function isCreditCardPaymentsGroup(groupName: string) {
    return normalizeDisplayName(groupName) === CREDIT_CARD_PAYMENTS_GROUP;
}

function isImported(mapping: YnabAccountMapping | undefined) {
    return Boolean(mapping && mapping.importRole !== "exclude");
}

function normalizePlanRows(records: YnabPlanCsvRecord[]) {
    return records.map((record, index) => ({
        activityCents: parseMoneyCents(record.Activity),
        assignedCents: parseMoneyCents(record.Assigned),
        availableCents: parseMoneyCents(record.Available),
        categoryName: normalizeDisplayName(record.Category),
        groupName: normalizeDisplayName(record["Category Group"]),
        periodId: parseMonthLabel(record.Month),
        rowIndex: index,
    }));
}

function normalizeRegisterRows(records: YnabRegisterCsvRecord[]) {
    return records.map((record, index) => {
        const occurredAt = parseRegisterDate(record.Date);
        const memo = record.Memo.trim();
        const outflowCents = parseMoneyCents(record.Outflow);
        const inflowCents = parseMoneyCents(record.Inflow);

        return {
            accountName: normalizeDisplayName(record.Account),
            amountCents: inflowCents - outflowCents,
            categoryName: normalizeDisplayName(record.Category),
            cleanedMemo: stripSplitMarker(memo),
            cleared: record.Cleared.trim(),
            date: getIsoDate(occurredAt),
            groupName: normalizeDisplayName(record["Category Group"]),
            inflowCents,
            memo,
            occurredAt,
            outflowCents,
            payee: normalizeDisplayName(record.Payee),
            periodId: getMonthlyPeriodId(occurredAt),
            rowIndex: index,
            splitMarker: parseSplitMarker(memo),
            transferTargetAccountName: parseTransferTarget(record.Payee),
        } satisfies NormalizedRegisterRow;
    });
}

function inferAccountType(accountName: string): AccountType {
    const normalized = normalizeKey(accountName);

    if (
        /\b(ira|529|brokerage|investment|investments|taxable|retirement|hsa)\b/.test(
            normalized,
        )
    ) {
        return "tracking";
    }

    if (/\b(credit|visa|mastercard|amex|discover|card)\b/.test(normalized)) {
        return "creditCard";
    }

    if (/\bsavings?\b/.test(normalized)) {
        return "savings";
    }

    if (/\bcash\b/.test(normalized)) {
        return "cash";
    }

    if (/\b(loan|mortgage)\b/.test(normalized)) {
        return "tracking";
    }

    return "checking";
}

export function inferYnabAccountMapping(accountName: string): YnabAccountMapping {
    const normalizedName = normalizeDisplayName(accountName);
    const accountType = inferAccountType(normalizedName);

    if (SYNTHETIC_ACCOUNT_NAMES.has(normalizedName)) {
        return {
            accountId: stableId("acct", [normalizedName]),
            accountName: normalizedName,
            accountType,
            importRole: "exclude",
            reason: "Synthetic YNAB rollover/transfer account.",
        };
    }

    if (accountType === "tracking") {
        return {
            accountId: stableId("acct", [normalizedName]),
            accountName: normalizedName,
            accountType,
            importRole: "tracking",
            reason: "Likely off-budget investment or tracking account.",
        };
    }

    return {
        accountId: stableId("acct", [normalizedName]),
        accountName: normalizedName,
        accountType,
        importRole: "budget",
        reason: "Likely on-budget account.",
    };
}

function buildAccountMappings(input: {
    explicitMappings?: YnabAccountMapping[];
    registerRows: NormalizedRegisterRow[];
}) {
    const accountNames = Array.from(
        new Set(input.registerRows.map((row) => row.accountName)),
    ).sort((left, right) => left.localeCompare(right));
    const explicitByName = new Map(
        (input.explicitMappings ?? []).map((mapping) => [
            normalizeKey(mapping.accountName),
            {
                ...mapping,
                accountName: normalizeDisplayName(mapping.accountName),
            },
        ]),
    );

    return accountNames.map(
        (accountName) =>
            explicitByName.get(normalizeKey(accountName)) ??
            inferYnabAccountMapping(accountName),
    );
}

function createBudgetGroups(input: {
    now: string;
    planRows: NormalizedPlanRow[];
    ledgerId: string;
}) {
    const groupByName = new Map<string, YnabBudgetGroupRecord>();

    for (const row of input.planRows) {
        if (!row.groupName) {
            continue;
        }

        const key = normalizeKey(row.groupName);

        if (!groupByName.has(key)) {
            groupByName.set(key, {
                groupId: stableId("grp", [row.groupName]),
                ledgerId: input.ledgerId,
                name: row.groupName,
                status: "active",
                sortOrder: groupByName.size,
                createdAt: input.now,
                updatedAt: input.now,
            });
        }
    }

    return Array.from(groupByName.values());
}

function createBudgetCategories(input: {
    groups: YnabBudgetGroupRecord[];
    now: string;
    planRows: NormalizedPlanRow[];
    ledgerId: string;
}) {
    const groupByName = new Map(
        input.groups.map((group) => [normalizeKey(group.name), group]),
    );
    const categoryByKey = new Map<string, YnabBudgetCategoryRecord>();
    const nextSortOrderByGroupId = new Map<string, number>();

    for (const row of input.planRows) {
        if (!row.groupName || !row.categoryName) {
            continue;
        }

        const key = categoryKey(row.groupName, row.categoryName);
        const group = groupByName.get(normalizeKey(row.groupName));

        if (!group || categoryByKey.has(key)) {
            continue;
        }

        const sortOrder = nextSortOrderByGroupId.get(group.groupId) ?? 0;
        nextSortOrderByGroupId.set(group.groupId, sortOrder + 1);

        categoryByKey.set(key, {
            allocationCadence: "monthly",
            allocationStartMonth: 1,
            categoryId: stableId("cat", [row.groupName, row.categoryName]),
            ledgerId: input.ledgerId,
            name: row.categoryName,
            groupId: group.groupId,
            defaultAssignedCents: row.assignedCents,
            isIncomeCategory: normalizeKey(row.groupName) === "income",
            ledgerAccountId: stableId("catacct", [
                row.groupName,
                row.categoryName,
            ]),
            status: "active",
            sortOrder,
            createdAt: input.now,
            updatedAt: input.now,
        });
    }

    for (const row of input.planRows) {
        const category = categoryByKey.get(
            categoryKey(row.groupName, row.categoryName),
        );

        if (category) {
            category.defaultAssignedCents = row.assignedCents;
        }
    }

    return Array.from(categoryByKey.values());
}

function createBudgetPeriods(input: {
    now: string;
    periodIds: string[];
    ledgerId: string;
}) {
    return input.periodIds.map((periodId, index) => {
        const bounds = getMonthlyPeriodBounds(periodId);

        return {
            ledgerId: input.ledgerId,
            periodId,
            startsOn: bounds.startsOn,
            endsOn: bounds.endsOn,
            currency: "USD",
            status: "open",
            carryForwardFromPeriodId:
                index > 0 ? input.periodIds[index - 1] : undefined,
            createdAt: input.now,
            updatedAt: input.now,
        } satisfies YnabBudgetPeriodRecord;
    });
}

function createAccounts(input: {
    accountMappings: YnabAccountMapping[];
    now: string;
    registerRows: NormalizedRegisterRow[];
    ledgerId: string;
}) {
    const rowsByAccountName = groupBy(
        input.registerRows,
        (row) => row.accountName,
    );

    return input.accountMappings
        .filter((mapping) => mapping.importRole !== "exclude")
        .map((mapping) => {
            const rows = rowsByAccountName.get(mapping.accountName) ?? [];
            const startingRows = rows.filter(isStartingBalance);
            const openingBalanceCents = startingRows.reduce(
                (total, row) => total + row.amountCents,
                0,
            );
            const openedOn =
                (startingRows[0] ?? rows[0])?.date ?? input.now.slice(0, 10);

            return {
                accountId: mapping.accountId,
                ledgerId: input.ledgerId,
                name: mapping.accountName,
                accountType: mapping.accountType,
                ledgerAccountId: stableId("ledgeracct", [
                    "account",
                    mapping.accountName,
                ]),
                openingBalanceCents,
                openedOn,
                createdAt: input.now,
                updatedAt: input.now,
            } satisfies YnabAccountRecord;
        });
}

function resolveCategory(
    row: Pick<NormalizedRegisterRow, "categoryName" | "groupName" | "rowIndex">,
    categoryByKey: Map<string, CategoryLookup>,
) {
    if (
        !row.groupName ||
        !row.categoryName ||
        isReadyToAssign(row) ||
        isCreditCardPaymentsGroup(row.groupName)
    ) {
        return undefined;
    }

    const category = categoryByKey.get(categoryKey(row.groupName, row.categoryName));

    if (!category) {
        throw new Error(
            `Register row ${getRegisterCsvRowNumber(row)} references unknown category ${row.groupName}: ${row.categoryName}.`,
        );
    }

    return category.category;
}

function createCategoryLookupByPlanPath(input: {
    categories: YnabBudgetCategoryRecord[];
    groups: YnabBudgetGroupRecord[];
}) {
    const groupById = new Map(input.groups.map((group) => [group.groupId, group]));

    return new Map(
        input.categories.map((category) => {
            const group = groupById.get(category.groupId);

            if (!group) {
                throw new Error(`Category ${category.name} references a missing group.`);
            }

            return [
                categoryKey(group.name, category.name),
                { category },
            ];
        }),
    );
}

function createCategoryAllocationRecords(input: {
    categoryByKey: Map<string, CategoryLookup>;
    now: string;
    planRows: NormalizedPlanRow[];
    ledgerId: string;
}) {
    const rowsByPeriod = groupBy(input.planRows, (row) => row.periodId);
    const periodIds = Array.from(rowsByPeriod.keys()).sort();
    const firstPeriodId = periodIds[0];
    const budgetAllocations: YnabCategoryAllocationRecord[] = [];

    for (const periodId of periodIds) {
        for (const row of rowsByPeriod.get(periodId) ?? []) {
            const category = input.categoryByKey.get(
                categoryKey(row.groupName, row.categoryName),
            )?.category;

            if (!category) {
                continue;
            }

            const assignedCents =
                periodId === firstPeriodId
                    ? row.assignedCents
                    : getEffectiveBudgetCategoryDefaultAssignedCents(
                          category,
                          periodId,
                      );

            budgetAllocations.push({
                allocationId: `${periodId}:${category.categoryId}`,
                ledgerId: input.ledgerId,
                periodId,
                categoryId: category.categoryId,
                assignedCents,
                updatedAt: input.now,
            });
        }
    }

    return { budgetAllocations };
}

function getTransactionStatus(cleared: string) {
    const normalized = normalizeKey(cleared);

    if (normalized === "reconciled") {
        return "reconciled" as const;
    }

    if (normalized === "cleared") {
        return "cleared" as const;
    }

    return "entered" as const;
}

function makePosting(input: {
    amountCents: number;
    direction: "credit" | "debit";
    ledgerAccountId: string;
    ledgerAccountKind: "category" | "equity" | "financial";
    occurredAt: string;
    periodId: string;
    postingIndex: number;
    transactionId: string;
    ledgerId: string;
}) {
    return {
        postingId: stableId("post", [
            input.transactionId,
            input.postingIndex,
            input.ledgerAccountId,
            input.direction,
        ]),
        transactionId: input.transactionId,
        ledgerId: input.ledgerId,
        ledgerAccountId: input.ledgerAccountId,
        ledgerAccountKind: input.ledgerAccountKind,
        direction: input.direction,
        amountCents: input.amountCents,
        occurredAt: input.occurredAt,
        periodId: input.periodId,
        createdAt: input.occurredAt,
    } satisfies YnabLedgerPostingRecord;
}

function makePostingRecords(input: {
    context: TransactionBuildContext;
    occurredAt: string;
    periodId: string;
    postings: TransactionPostingInput[];
    transactionId: string;
}) {
    return input.postings.map((posting, index) =>
        makePosting({
            ...posting,
            transactionId: input.transactionId,
            ledgerId: input.context.ledgerId,
            occurredAt: input.occurredAt,
            periodId: input.periodId,
            postingIndex: index,
        }),
    );
}

function createImportedTransactionRecord(input: {
    cleared: string;
    context: TransactionBuildContext;
    displayAmountCents: number;
    memo?: string;
    occurredAt: string;
    payee?: string;
    periodId: string;
    referenceAccountId: string;
    referenceCategoryId?: string;
    transactionId: string;
}) {
    return {
        transactionId: input.transactionId,
        ledgerId: input.context.ledgerId,
        occurredAt: input.occurredAt,
        enteredAt: input.occurredAt,
        kind: "standard",
        payee: normalizeOptionalString(input.payee),
        memo: input.memo,
        referenceAccountId: input.referenceAccountId,
        referenceCategoryId: input.referenceCategoryId,
        displayAmountCents: input.displayAmountCents,
        source: "manual",
        status: getTransactionStatus(input.cleared),
        periodId: input.periodId,
        updatedAt: input.context.now,
    } satisfies YnabTransactionRecord;
}

function createImportedTransactionLineRecord(input: {
    amountCents: number;
    categoryId?: string;
    context: TransactionBuildContext;
    fromAccountId: string;
    lineIndex: number;
    memo?: string;
    payee?: string;
    toAccountId: string;
    transactionId: string;
}) {
    return {
        lineId: stableId("line", [input.transactionId, input.lineIndex]),
        transactionId: input.transactionId,
        ledgerId: input.context.ledgerId,
        amountCents: input.amountCents,
        categoryId: input.categoryId ?? NO_TRANSACTION_LINE_CATEGORY_ID,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        payee: normalizeOptionalString(input.payee),
        memo: input.memo,
        sortOrder: input.lineIndex,
        createdAt: input.context.now,
        updatedAt: input.context.now,
    } satisfies YnabTransactionLineRecord;
}

function createNormalTransaction(input: {
    context: TransactionBuildContext;
    idParts: unknown[];
    row: NormalizedRegisterRow;
}) {
    const account = getImportedAccount({
        accountName: input.row.accountName,
        context: input.context,
        missingMessage: `Register row ${getRegisterCsvRowNumber(input.row)} references an account that is not imported.`,
    });

    if (input.row.amountCents === 0) {
        return null;
    }

    const amountCents = Math.abs(input.row.amountCents);
    const isInflow = input.row.amountCents > 0;
    const transactionId = stableId("txn", input.idParts);
    const category = resolveCategory(input.row, input.context.categoryByKey);
    const transaction = createImportedTransactionRecord({
        transactionId,
        context: input.context,
        occurredAt: input.row.occurredAt,
        payee: input.row.payee,
        memo: input.row.cleanedMemo,
        referenceAccountId: account.accountId,
        referenceCategoryId:
            category?.categoryId ?? UNCATEGORIZED_REFERENCE_CATEGORY_ID,
        displayAmountCents: input.row.amountCents,
        cleared: input.row.cleared,
        periodId: input.row.periodId,
    });
    const transactionLine = createImportedTransactionLineRecord({
        transactionId,
        context: input.context,
        lineIndex: 0,
        amountCents,
        categoryId: category?.categoryId,
        fromAccountId: isInflow
            ? NO_TRANSACTION_LINE_FROM_ACCOUNT_ID
            : account.accountId,
        toAccountId: isInflow
            ? account.accountId
            : NO_TRANSACTION_LINE_TO_ACCOUNT_ID,
        payee: input.row.payee,
        memo: input.row.cleanedMemo,
    });
    const ledgerPostings = makePostingRecords({
        context: input.context,
        transactionId,
        occurredAt: input.row.occurredAt,
        periodId: input.row.periodId,
        postings: buildTransactionLinePostingInputs({
            amountCents,
            categoryLedgerAccountId: category?.ledgerAccountId,
            fromLedgerAccountId: isInflow ? undefined : account.ledgerAccountId,
            toLedgerAccountId: isInflow ? account.ledgerAccountId : undefined,
            uncategorizedEquityLedgerAccountId:
                UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID,
        }),
    });

    return {
        ledgerPostings,
        transaction,
        transactionLines: [transactionLine],
    };
}

function fingerprintRow(row: NormalizedRegisterRow) {
    return {
        accountName: row.accountName,
        amountCents: row.amountCents,
        categoryName: row.categoryName,
        groupName: row.groupName,
        memo: row.memo,
        occurredAt: row.occurredAt,
        payee: row.payee,
        rowIndex: row.rowIndex,
    };
}

function findSplitSequences(rows: NormalizedRegisterRow[]) {
    const consumed = new Set<number>();
    const sequences: NormalizedRegisterRow[][] = [];

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];

        if (
            consumed.has(row.rowIndex) ||
            !row.splitMarker ||
            row.splitMarker.total === 1
        ) {
            continue;
        }

        if (row.splitMarker.index !== 1) {
            throw new Error(
                `Split row ${getRegisterCsvRowNumber(row)} starts at ${row.splitMarker.index}/${row.splitMarker.total}; expected 1/${row.splitMarker.total}.`,
            );
        }

        const sequence = [row];
        consumed.add(row.rowIndex);

        for (
            let cursor = index + 1;
            cursor < rows.length && sequence.length < row.splitMarker.total;
            cursor += 1
        ) {
            const candidate = rows[cursor];

            if (
                consumed.has(candidate.rowIndex) ||
                candidate.accountName !== row.accountName ||
                candidate.date !== row.date ||
                candidate.splitMarker?.total !== row.splitMarker.total ||
                candidate.splitMarker.index !== sequence.length + 1
            ) {
                continue;
            }

            sequence.push(candidate);
            consumed.add(candidate.rowIndex);
        }

        if (sequence.length !== row.splitMarker.total) {
            throw new Error(
                `Incomplete split sequence beginning at register row ${getRegisterCsvRowNumber(row)}.`,
            );
        }

        sequences.push(sequence);
    }

    return { consumed, sequences };
}

function createSplitTransaction(input: {
    context: TransactionBuildContext;
    sequence: NormalizedRegisterRow[];
}) {
    const [firstRow] = input.sequence;
    const parentAccount = getImportedAccount({
        accountName: firstRow.accountName,
        context: input.context,
        missingMessage: `Multi-line transaction references an account that is not imported: ${firstRow.accountName}.`,
    });

    const displayAmountCents = input.sequence.reduce(
        (total, row) => total + row.amountCents,
        0,
    );

    const transactionId = stableId("txn", [
        "split",
        input.sequence.map(fingerprintRow),
    ]);
    const transaction = createImportedTransactionRecord({
        transactionId,
        context: input.context,
        occurredAt: firstRow.occurredAt,
        payee: firstRow.payee,
        memo: firstRow.cleanedMemo,
        referenceAccountId: parentAccount.accountId,
        referenceCategoryId: isZeroNetMultiLineTransaction({
            displayAmountCents,
            lines: input.sequence,
        })
            ? ZERO_NET_REFERENCE_CATEGORY_ID
            : MIXED_REFERENCE_CATEGORY_ID,
        displayAmountCents,
        cleared: firstRow.cleared,
        periodId: firstRow.periodId,
    });
    const transactionLines: YnabTransactionLineRecord[] = [];
    const postingInputs: TransactionPostingInput[] = [];

    input.sequence.forEach((row, index) => {
        const amountCents = Math.abs(row.amountCents);
        const isPositiveLine = row.amountCents > 0;
        const category = row.transferTargetAccountName
            ? undefined
            : resolveCategory(row, input.context.categoryByKey);
        const transferAccount = row.transferTargetAccountName
            ? getImportedAccount({
                  accountName: row.transferTargetAccountName,
                  context: input.context,
                  missingMessage: `Split row ${getRegisterCsvRowNumber(row)} references a transfer account that is not imported: ${row.transferTargetAccountName}.`,
              })
            : undefined;

        transactionLines.push(
            createImportedTransactionLineRecord({
                transactionId,
                context: input.context,
                lineIndex: index,
                amountCents,
                categoryId: category?.categoryId,
                fromAccountId: transferAccount
                    ? isPositiveLine
                        ? transferAccount.accountId
                        : parentAccount.accountId
                    : isPositiveLine
                      ? NO_TRANSACTION_LINE_FROM_ACCOUNT_ID
                      : parentAccount.accountId,
                toAccountId: transferAccount
                    ? isPositiveLine
                        ? parentAccount.accountId
                        : transferAccount.accountId
                    : isPositiveLine
                      ? parentAccount.accountId
                      : NO_TRANSACTION_LINE_TO_ACCOUNT_ID,
                payee: row.payee,
                memo: row.cleanedMemo,
            }),
        );
        postingInputs.push(
            ...buildTransactionLinePostingInputs({
                amountCents,
                categoryLedgerAccountId: category?.ledgerAccountId,
                fromLedgerAccountId: isPositiveLine
                    ? transferAccount?.ledgerAccountId
                    : parentAccount.ledgerAccountId,
                toLedgerAccountId: isPositiveLine
                    ? parentAccount.ledgerAccountId
                    : transferAccount?.ledgerAccountId,
                uncategorizedEquityLedgerAccountId:
                    UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID,
            }),
        );
    });

    const groupedPostings = groupTransactionPostingInputs(postingInputs);

    return {
        transaction,
        transactionLines,
        ledgerPostings: makePostingRecords({
            context: input.context,
            transactionId,
            occurredAt: firstRow.occurredAt,
            periodId: firstRow.periodId,
            postings: groupedPostings,
        }),
    };
}

function createTransferPairKey(row: NormalizedRegisterRow) {
    if (!row.transferTargetAccountName) {
        throw new Error("Transfer target is required.");
    }

    const accounts = [row.accountName, row.transferTargetAccountName].sort();

    return [
        row.date,
        Math.abs(row.amountCents),
        accounts[0],
        accounts[1],
    ].join("|");
}

function findSplitTransferCounterpart(input: {
    consumed: Set<number>;
    importedRows: NormalizedRegisterRow[];
    parentAccountName: string;
    splitRow: NormalizedRegisterRow;
}) {
    const transferTargetAccountName = input.splitRow.transferTargetAccountName;

    if (!transferTargetAccountName) {
        return undefined;
    }

    return input.importedRows.find(
        (candidate) =>
            !input.consumed.has(candidate.rowIndex) &&
            candidate.rowIndex !== input.splitRow.rowIndex &&
            candidate.accountName === transferTargetAccountName &&
            candidate.transferTargetAccountName === input.parentAccountName &&
            candidate.date === input.splitRow.date &&
            candidate.amountCents === -input.splitRow.amountCents,
    );
}

function createTransferTransaction(input: {
    context: TransactionBuildContext;
    rows: NormalizedRegisterRow[];
}) {
    const debitRow = input.rows.find((row) => row.amountCents > 0);
    const creditRow = input.rows.find((row) => row.amountCents < 0);

    if (!debitRow || !creditRow) {
        throw new Error(
            `Transfer pair on ${input.rows[0].date} must include one inflow and one outflow row.`,
        );
    }

    const sourceAccount = getImportedAccount({
        accountName: creditRow.accountName,
        context: input.context,
        missingMessage: "Transfer pair references an account that is not imported.",
    });
    const targetAccount = getImportedAccount({
        accountName: debitRow.accountName,
        context: input.context,
        missingMessage: "Transfer pair references an account that is not imported.",
    });

    const amountCents = Math.abs(creditRow.amountCents);
    const transactionId = stableId("txn", [
        "transfer",
        input.rows.map(fingerprintRow),
    ]);
    const transferPayee = `Transfer: ${targetAccount.name}`;
    const transferMemo = creditRow.cleanedMemo ?? debitRow.cleanedMemo;
    const transaction = createImportedTransactionRecord({
        transactionId,
        context: input.context,
        occurredAt: creditRow.occurredAt,
        payee: transferPayee,
        memo: transferMemo,
        referenceAccountId: sourceAccount.accountId,
        referenceCategoryId: MIXED_REFERENCE_CATEGORY_ID,
        displayAmountCents: creditRow.amountCents,
        cleared: creditRow.cleared,
        periodId: creditRow.periodId,
    });
    const transactionLine = createImportedTransactionLineRecord({
        transactionId,
        context: input.context,
        lineIndex: 0,
        amountCents,
        fromAccountId: sourceAccount.accountId,
        toAccountId: targetAccount.accountId,
        payee: transferPayee,
        memo: transferMemo,
    });
    const ledgerPostings = makePostingRecords({
        context: input.context,
        transactionId,
        occurredAt: creditRow.occurredAt,
        periodId: creditRow.periodId,
        postings: buildTransactionLinePostingInputs({
            amountCents,
            fromLedgerAccountId: sourceAccount.ledgerAccountId,
            toLedgerAccountId: targetAccount.ledgerAccountId,
            uncategorizedEquityLedgerAccountId:
                UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID,
        }),
    });

    return {
        ledgerPostings,
        transaction,
        transactionLines: [transactionLine],
    };
}

function appendTransactionRecords(
    result: TransactionBuildResult,
    records: {
        ledgerPostings: YnabLedgerPostingRecord[];
        transaction: YnabTransactionRecord;
        transactionLines: YnabTransactionLineRecord[];
    } | null,
) {
    if (!records) {
        return;
    }

    result.transactions.push(records.transaction);
    result.ledgerPostings.push(...records.ledgerPostings);
    result.transactionLines.push(...records.transactionLines);
}

function buildTransactions(input: {
    accountByName: Map<string, YnabAccountRecord>;
    accountMappingByName: Map<string, YnabAccountMapping>;
    categoryByKey: Map<string, CategoryLookup>;
    ledgerId: string;
    now: string;
    registerRows: NormalizedRegisterRow[];
}): TransactionBuildResult {
    const context: TransactionBuildContext = {
        accountByName: input.accountByName,
        accountMappingByName: input.accountMappingByName,
        categoryByKey: input.categoryByKey,
        ledgerId: input.ledgerId,
        now: input.now,
    };
    const importedRows = input.registerRows.filter((row) =>
        isImported(input.accountMappingByName.get(row.accountName)),
    );
    const consumed = new Set<number>();
    const result: TransactionBuildResult = {
        ledgerPostings: [],
        multiLineTransactionCount: 0,
        transactionLines: [],
        transactions: [],
    };
    const splitSequences = findSplitSequences(importedRows);

    for (const sequence of splitSequences.sequences) {
        for (const row of sequence) {
            consumed.add(row.rowIndex);
        }

        for (const row of sequence) {
            const counterpart = findSplitTransferCounterpart({
                consumed,
                importedRows,
                parentAccountName: sequence[0].accountName,
                splitRow: row,
            });

            if (counterpart) {
                consumed.add(counterpart.rowIndex);
            }
        }

        appendTransactionRecords(
            result,
            createSplitTransaction({ context, sequence }),
        );
        result.multiLineTransactionCount += 1;
    }

    const eligibleTransferRows = importedRows.filter((row) => {
        if (
            consumed.has(row.rowIndex) ||
            isStartingBalance(row) ||
            !row.transferTargetAccountName
        ) {
            return false;
        }

        const targetMapping = input.accountMappingByName.get(
            row.transferTargetAccountName,
        );

        if (!isImported(targetMapping)) {
            throw new Error(
                `Register row ${getRegisterCsvRowNumber(row)} transfers to an account that is not imported: ${row.transferTargetAccountName}.`,
            );
        }

        return true;
    });
    const transferRowsByKey = groupBy(eligibleTransferRows, createTransferPairKey);

    for (const rows of transferRowsByKey.values()) {
        const debitRows = rows.filter((row) => row.amountCents > 0);
        const creditRows = rows.filter((row) => row.amountCents < 0);

        if (
            debitRows.length !== creditRows.length ||
            debitRows.length + creditRows.length !== rows.length
        ) {
            throw new Error(
                `Unmatched transfer pair for ${rows[0].date} ${rows[0].payee}.`,
            );
        }

        for (let index = 0; index < creditRows.length; index += 1) {
            const pair = [creditRows[index], debitRows[index]];

            for (const row of pair) {
                consumed.add(row.rowIndex);
            }

            appendTransactionRecords(
                result,
                createTransferTransaction({ context, rows: pair }),
            );
        }
    }

    for (const row of importedRows) {
        if (consumed.has(row.rowIndex) || isStartingBalance(row)) {
            continue;
        }

        appendTransactionRecords(
            result,
            createNormalTransaction({
                context,
                idParts: ["normal", fingerprintRow(row)],
                row,
            }),
        );
    }

    return result;
}

function createSummary(input: {
    accountMappings: YnabAccountMapping[];
    budgetCategories: YnabBudgetCategoryRecord[];
    budgetGroups: YnabBudgetGroupRecord[];
    periodIds: string[];
    skippedSyntheticAccountCount: number;
    transactionResult: TransactionBuildResult;
    warnings: YnabImportWarning[];
}) {
    const accountCountByRole: Record<YnabImportRole, number> = {
        budget: 0,
        exclude: 0,
        tracking: 0,
    };

    for (const mapping of input.accountMappings) {
        accountCountByRole[mapping.importRole] += 1;
    }

    return {
        accountCountByRole,
        budgetCategoryCount: input.budgetCategories.length,
        budgetGroupCount: input.budgetGroups.length,
        firstMonth: input.periodIds[0] ?? null,
        lastMonth: input.periodIds.at(-1) ?? null,
        skippedSyntheticAccountCount: input.skippedSyntheticAccountCount,
        multiLineTransactionCount: input.transactionResult.multiLineTransactionCount,
        transactionLineCount: input.transactionResult.transactionLines.length,
        transactionCount: input.transactionResult.transactions.length,
        warnings: input.warnings,
    } satisfies YnabImportSummary;
}

function createImportWarnings(input: {
    accountMappings: YnabAccountMapping[];
    registerRows: NormalizedRegisterRow[];
}) {
    const accountMappingByName = new Map(
        input.accountMappings.map((mapping) => [mapping.accountName, mapping]),
    );
    const warnings: YnabImportWarning[] = [];

    for (const row of input.registerRows) {
        const mapping = accountMappingByName.get(row.accountName);
        const categoryPath = getCategoryPath(row);

        if (
            mapping?.importRole !== "tracking" ||
            !isStartingBalance(row) ||
            !categoryPath ||
            isReadyToAssign(row)
        ) {
            continue;
        }

        const rowNumber = getRegisterCsvRowNumber(row);

        warnings.push({
            accountName: row.accountName,
            amountCents: row.amountCents,
            categoryPath,
            code: "trackingCategorizedStartingBalance",
            message:
                `Tracking account "${row.accountName}" has a categorized Starting Balance of ${formatCents(row.amountCents)} in "${categoryPath}" on register row ${rowNumber}. ` +
                "Tracking accounts do not fund budget categories; map this account as budget if these dollars back the plan.",
            rowNumber,
        });
    }

    return warnings;
}

export function createYnabImportPlan(input: YnabImportBuildInput): YnabImportPlan {
    const now = input.now ?? new Date().toISOString();

    if (input.endMonth && !isMonthlyPeriodId(input.endMonth)) {
        throw new Error("YNAB import end month must be in YYYY-MM format.");
    }

    const planRows = normalizePlanRows(input.export.planRecords).filter(
        (row) => !input.endMonth || row.periodId <= input.endMonth,
    );
    const registerRows = normalizeRegisterRows(
        input.export.registerRecords,
    ).filter((row) => !input.endMonth || row.periodId <= input.endMonth);
    const accountMappings = buildAccountMappings({
        explicitMappings: input.accountMappings,
        registerRows,
    });
    const accountMappingByName = new Map(
        accountMappings.map((mapping) => [mapping.accountName, mapping]),
    );
    const budgetGroups = createBudgetGroups({
        now,
        planRows,
        ledgerId: input.ledgerId,
    });
    const budgetCategories = createBudgetCategories({
        groups: budgetGroups,
        now,
        planRows,
        ledgerId: input.ledgerId,
    });
    const categoryByKey = createCategoryLookupByPlanPath({
        categories: budgetCategories,
        groups: budgetGroups,
    });
    const accounts = createAccounts({
        accountMappings,
        now,
        registerRows,
        ledgerId: input.ledgerId,
    });
    const accountByName = new Map(
        accounts.map((account) => [account.name, account]),
    );
    const transactionResult = buildTransactions({
        accountByName,
        accountMappingByName,
        categoryByKey,
        ledgerId: input.ledgerId,
        now,
        registerRows,
    });
    const periodIds = Array.from(
        new Set([
            ...planRows.map((row) => row.periodId),
            ...transactionResult.transactions.map(
                (transaction) => transaction.periodId,
            ),
        ]),
    ).sort();
    const budgetPeriods = createBudgetPeriods({
        now,
        periodIds,
        ledgerId: input.ledgerId,
    });
    const { budgetAllocations } = createCategoryAllocationRecords({
        categoryByKey,
        now,
        planRows,
        ledgerId: input.ledgerId,
    });
    const skippedSyntheticAccountCount = accountMappings.filter(
        (mapping) =>
            mapping.importRole === "exclude" &&
            SYNTHETIC_ACCOUNT_NAMES.has(mapping.accountName),
    ).length;
    const warnings = createImportWarnings({
        accountMappings,
        registerRows,
    });

    return {
        accountMappings,
        records: {
            accounts,
            budgetAllocations,
            budgetCategories,
            budgetGroups,
            budgetPeriods,
            ledgerPostings: transactionResult.ledgerPostings,
            transactionLines: transactionResult.transactionLines,
            transactions: transactionResult.transactions,
        },
        summary: createSummary({
            accountMappings,
            budgetCategories,
            budgetGroups,
            periodIds,
            skippedSyntheticAccountCount,
            transactionResult,
            warnings,
        }),
    };
}

export const ynabImportTestInternals = {
    categoryKey,
    parseMoneyCents,
    parseMonthLabel,
    parseRegisterDate,
    stableId,
};
