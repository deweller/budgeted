import { buildBudgetPeriodSummaryFromSnapshot } from "@/lib/workspace/budget-projector";
import type {
    WorkspaceBudgetCategoryRecord,
    WorkspaceSnapshot,
    WorkspaceTransactionLineRecord,
    WorkspaceTransactionImportActivityRecord,
} from "@/lib/workspace/sync-types";
import { isBudgetCategoryActivityAccountType } from "@/modules/accounts/account-types";
import { isUserVisibleBudgetCategory } from "@/modules/budgeting";
import {
    isUncategorizedCategoryId,
    UNCATEGORIZED_CATEGORY_ID,
    UNCATEGORIZED_CATEGORY_NAME,
} from "@/modules/budgeting/uncategorized";
import {
    isUnassignedCategoryId,
    UNASSIGNED_CATEGORY_ID,
    UNASSIGNED_CATEGORY_NAME,
} from "@/modules/budgeting/unassigned";
import {
    getMonthlyPeriodBounds,
    getMonthlyPeriodId,
    getPreviousMonthlyPeriodId,
    isMonthlyPeriodId,
    shiftMonthlyPeriod,
} from "@/modules/ledger";

export type CategoryDetailReportFilterMode = "all" | "month" | "year";
export type CategoryDetailReportEventScope = "all" | "transactions";

export type CategoryDetailReportCategoryOption = {
    categoryId: string;
    groupName?: string;
    name: string;
};

export type CategoryDetailReportEventType =
    | "allocation"
    | "projection"
    | "transaction";

export type CategoryDetailReportEvent = {
    amountCents: number;
    date: string;
    eventId: string;
    hideAmount?: boolean;
    importActivities?: WorkspaceTransactionImportActivityRecord[];
    memo: string;
    payee: string;
    periodId: string;
    runningCents: number;
    sortPriority: number;
    transactionId?: string;
    type: CategoryDetailReportEventType;
};

export type CategoryDetailReportView = {
    allocationTotalCents: number;
    categoryOptions: CategoryDetailReportCategoryOption[];
    endDate: string;
    eventCount: number;
    events: CategoryDetailReportEvent[];
    filterMode: CategoryDetailReportFilterMode;
    openingCents: number;
    periodId: string;
    selectedCategoryId: string;
    selectedCategoryName: string;
    startDate: string;
    totalCents: number;
    transactionTotalCents: number;
    year: string;
};

type CategoryDetailReportInput = {
    categoryId?: string;
    eventScope?: CategoryDetailReportEventScope;
    filterMode?: CategoryDetailReportFilterMode;
    periodId?: string;
    snapshot: WorkspaceSnapshot;
    year?: string;
};

type UnsummedCategoryDetailReportEvent = Omit<
    CategoryDetailReportEvent,
    "runningCents"
>;

const yearPattern = /^\d{4}$/;

function getCategoryGroupName(
    category: WorkspaceBudgetCategoryRecord,
    groupNameById: Map<string, string>,
) {
    return groupNameById.get(category.groupId) ?? "Archived";
}

export function listCategoryDetailReportCategories(
    snapshot: WorkspaceSnapshot,
): CategoryDetailReportCategoryOption[] {
    const groupNameById = new Map(
        snapshot.budgetGroups.map((group) => [group.groupId, group.name]),
    );
    const groupSortOrderById = new Map(
        snapshot.budgetGroups.map((group) => [group.groupId, group.sortOrder]),
    );
    const categories = snapshot.budgetCategories
        .filter(isUserVisibleBudgetCategory)
        .sort((left, right) => {
            const leftGroupSort =
                groupSortOrderById.get(left.groupId) ?? Number.MAX_SAFE_INTEGER;
            const rightGroupSort =
                groupSortOrderById.get(right.groupId) ?? Number.MAX_SAFE_INTEGER;

            if (leftGroupSort !== rightGroupSort) {
                return leftGroupSort - rightGroupSort;
            }

            if (left.sortOrder !== right.sortOrder) {
                return left.sortOrder - right.sortOrder;
            }

            return left.name.localeCompare(right.name);
        })
        .map((category) => ({
            categoryId: category.categoryId,
            groupName: getCategoryGroupName(category, groupNameById),
            name: category.name,
        }));

    return [
        {
            categoryId: UNASSIGNED_CATEGORY_ID,
            name: UNASSIGNED_CATEGORY_NAME,
        },
        {
            categoryId: UNCATEGORIZED_CATEGORY_ID,
            name: UNCATEGORIZED_CATEGORY_NAME,
        },
        ...categories,
    ];
}

export function getDefaultCategoryDetailReportPeriodId(
    snapshot: WorkspaceSnapshot,
    anchor = new Date(),
) {
    return listReportPeriodIds(snapshot).at(-1) ?? getMonthlyPeriodId(anchor);
}

function listReportPeriodIds(snapshot: WorkspaceSnapshot) {
    const periodIds = new Set<string>();

    for (const period of snapshot.budgetPeriods) {
        periodIds.add(period.periodId);
    }

    for (const allocation of snapshot.budgetAllocations) {
        periodIds.add(allocation.periodId);
    }

    for (const transaction of snapshot.transactions) {
        periodIds.add(transaction.periodId);
    }

    for (const account of snapshot.accounts) {
        try {
            periodIds.add(getMonthlyPeriodId(account.openedOn));
        } catch {
            // Ignore malformed legacy dates in read-only reporting controls.
        }
    }

    return Array.from(periodIds).filter(isMonthlyPeriodId).sort();
}

function normalizeYear(year: string | undefined, fallbackPeriodId: string) {
    return year && yearPattern.test(year) ? year : fallbackPeriodId.slice(0, 4);
}

function resolveReportRange(input: {
    filterMode?: CategoryDetailReportFilterMode;
    periodId?: string;
    snapshot: WorkspaceSnapshot;
    year?: string;
}) {
    const defaultPeriodId = getDefaultCategoryDetailReportPeriodId(input.snapshot);
    const filterMode = input.filterMode ?? "all";
    const periodId =
        input.periodId && isMonthlyPeriodId(input.periodId)
            ? input.periodId
            : defaultPeriodId;
    const year = normalizeYear(input.year, periodId);

    if (filterMode === "all") {
        return {
            endDate: "9999-12-31",
            filterMode,
            periodId,
            periodIds: listReportPeriodIds(input.snapshot),
            startDate: "0000-01-01",
            year,
        };
    }

    if (filterMode === "year") {
        return {
            endDate: `${year}-12-31`,
            filterMode,
            periodId,
            periodIds: listPeriodIdsInRange(`${year}-01`, `${year}-12`),
            startDate: `${year}-01-01`,
            year,
        };
    }

    const period = getMonthlyPeriodBounds(periodId);

    return {
        endDate: period.endsOn,
        filterMode,
        periodId,
        periodIds: [periodId],
        startDate: period.startsOn,
        year,
    };
}

function listPeriodIdsInRange(startPeriodId: string, endPeriodId: string) {
    const periodIds: string[] = [];
    let currentPeriodId = startPeriodId;

    while (currentPeriodId <= endPeriodId) {
        periodIds.push(currentPeriodId);
        currentPeriodId = shiftMonthlyPeriod(currentPeriodId, 1).periodId;
    }

    return periodIds;
}

function getPreviousPeriodIdForRange(input: {
    filterMode: CategoryDetailReportFilterMode;
    periodId: string;
    year: string;
}) {
    if (input.filterMode === "all") {
        return null;
    }

    if (input.filterMode === "year") {
        return `${Number(input.year) - 1}-12`;
    }

    return getPreviousMonthlyPeriodId(input.periodId);
}

function findSummaryCategoryAvailableCents(
    snapshot: WorkspaceSnapshot,
    periodId: string,
    categoryId: string,
) {
    return (
        buildBudgetPeriodSummaryFromSnapshot(snapshot, periodId).categories.find(
            (category) => category.categoryId === categoryId,
        )?.availableCents ?? 0
    );
}

function isReportableTransaction(transaction: {
    kind?: "adjustment" | "standard";
    status?: "cleared" | "entered" | "reconciled" | "voided";
}) {
    return transaction.status !== "voided" && transaction.kind !== "adjustment";
}

function isOneSidedBudgetAccountLine(
    line: WorkspaceTransactionLineRecord,
    budgetAccountIds: Set<string>,
) {
    if (Boolean(line.fromAccountId) === Boolean(line.toAccountId)) {
        return false;
    }

    const accountId = line.fromAccountId ?? line.toAccountId;

    return Boolean(accountId && budgetAccountIds.has(accountId));
}

function getLineSignedAmountCents(line: WorkspaceTransactionLineRecord) {
    return line.toAccountId ? line.amountCents : -line.amountCents;
}

function buildAllocationEvents(input: {
    categoryId: string;
    periodIds: string[];
    snapshot: WorkspaceSnapshot;
}) {
    return input.periodIds.flatMap((periodId) => {
        const summary = buildBudgetPeriodSummaryFromSnapshot(
            input.snapshot,
            periodId,
        );
        const bounds = getMonthlyPeriodBounds(periodId);

        if (isUncategorizedCategoryId(input.categoryId)) {
            return [];
        }

        if (isUnassignedCategoryId(input.categoryId)) {
            const amountCents = summary.assignedAllocationTotalCents;

            if (amountCents === 0) {
                return [];
            }

            return [
                {
                    amountCents,
                    date: bounds.startsOn,
                    eventId: `allocation:${periodId}:${UNASSIGNED_CATEGORY_ID}`,
                    memo: "Net assigned allocations",
                    payee: "",
                    periodId,
                    sortPriority: 20,
                    type: "allocation" as const,
                },
            ];
        }

        const category = summary.categories.find(
            (summaryCategory) =>
                summaryCategory.categoryId === input.categoryId,
        );

        if (!category || category.assignedCents === 0) {
            return [];
        }

        return [
            {
                amountCents: category.assignedCents,
                date: bounds.startsOn,
                eventId: `allocation:${periodId}:${input.categoryId}`,
                memo: "Monthly category assignment",
                payee: "",
                periodId,
                sortPriority: 20,
                type: "allocation" as const,
            },
        ];
    });
}

function buildTransactionEvents(input: {
    categoryId: string;
    endDate: string;
    snapshot: WorkspaceSnapshot;
    startDate: string;
}) {
    const accountById = new Map(
        input.snapshot.accounts.map((account) => [account.accountId, account]),
    );
    const budgetAccountIds = new Set(
        input.snapshot.accounts
            .filter((account) =>
                isBudgetCategoryActivityAccountType(account.accountType),
            )
            .map((account) => account.accountId),
    );
    const events: UnsummedCategoryDetailReportEvent[] = [];

    for (const transaction of input.snapshot.transactions) {
        const date = transaction.occurredAt.slice(0, 10);

        if (
            date < input.startDate ||
            date > input.endDate ||
            transaction.status === "voided" ||
            !isReportableTransaction(transaction)
        ) {
            continue;
        }

        for (const line of transaction.lines) {
            if (!isOneSidedBudgetAccountLine(line, budgetAccountIds)) {
                continue;
            }

            if (isUncategorizedCategoryId(input.categoryId)) {
                if (line.categoryId) {
                    continue;
                }
            } else if (line.categoryId !== input.categoryId) {
                continue;
            }

            const accountId = line.fromAccountId ?? line.toAccountId;
            const account = accountId ? accountById.get(accountId) : undefined;

            events.push({
                amountCents: getLineSignedAmountCents(line),
                date,
                eventId: `transaction:${transaction.transactionId}:${line.lineId}`,
                importActivities: transaction.importActivities ?? [],
                memo: line.memo ?? transaction.memo ?? account?.name ?? "",
                payee: line.payee ?? transaction.payee ?? "",
                periodId: transaction.periodId,
                sortPriority: 30 + line.sortOrder,
                transactionId: transaction.transactionId,
                type: "transaction",
            });
        }
    }

    return events;
}

function sortEvents(events: UnsummedCategoryDetailReportEvent[]) {
    return [...events].sort((left, right) => {
        if (left.date !== right.date) {
            return left.date.localeCompare(right.date);
        }

        if (left.sortPriority !== right.sortPriority) {
            return left.sortPriority - right.sortPriority;
        }

        return left.eventId.localeCompare(right.eventId);
    });
}

function attachRunningTotals(
    events: UnsummedCategoryDetailReportEvent[],
    openingCents: number,
) {
    let runningCents = openingCents;

    return events.map((event) => {
        runningCents += event.amountCents;

        return {
            ...event,
            runningCents,
        };
    });
}

export function buildCategoryDetailReportView(
    input: CategoryDetailReportInput,
): CategoryDetailReportView {
    const categoryOptions = listCategoryDetailReportCategories(input.snapshot);
    const selectedCategory =
        categoryOptions.find((category) => category.categoryId === input.categoryId) ??
        categoryOptions[0] ?? {
            categoryId: UNASSIGNED_CATEGORY_ID,
            name: UNASSIGNED_CATEGORY_NAME,
        };
    const eventScope = input.eventScope ?? "all";
    const range = resolveReportRange(input);
    const openingPeriodId = getPreviousPeriodIdForRange(range);
    const openingCents = eventScope === "transactions"
        ? 0
        : isUnassignedCategoryId(selectedCategory.categoryId)
        ? 0
        : openingPeriodId
        ? findSummaryCategoryAvailableCents(
              input.snapshot,
              openingPeriodId,
              selectedCategory.categoryId,
          )
        : 0;
    const allocationEvents =
        eventScope === "transactions"
            ? []
            : buildAllocationEvents({
                  categoryId: selectedCategory.categoryId,
                  periodIds: range.periodIds,
                  snapshot: input.snapshot,
              });
    const transactionEvents = isUnassignedCategoryId(
        selectedCategory.categoryId,
    )
        ? []
        : buildTransactionEvents({
              categoryId: selectedCategory.categoryId,
              endDate: range.endDate,
              snapshot: input.snapshot,
              startDate: range.startDate,
          });
    const events = attachRunningTotals(
        sortEvents([...allocationEvents, ...transactionEvents]),
        openingCents,
    );
    const allocationTotalCents = events
        .filter((event) => event.type === "allocation")
        .reduce((total, event) => total + event.amountCents, 0);
    const transactionTotalCents = events
        .filter((event) => event.type === "transaction")
        .reduce((total, event) => total + event.amountCents, 0);

    return {
        allocationTotalCents,
        categoryOptions,
        endDate: range.endDate,
        eventCount: events.length,
        events,
        filterMode: range.filterMode,
        openingCents,
        periodId: range.periodId,
        selectedCategoryId: selectedCategory.categoryId,
        selectedCategoryName: selectedCategory.name,
        startDate: range.startDate,
        totalCents: events.at(-1)?.runningCents ?? openingCents,
        transactionTotalCents,
        year: range.year,
    };
}
