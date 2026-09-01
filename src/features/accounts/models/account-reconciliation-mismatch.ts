import type {
    AccountReconciliationMismatchSuggestion,
    AccountReconciliationMismatchTransaction,
} from "@/features/accounts/models/account-reconciliation";
import {
    findTransactionAutoMatches,
    type TransactionAutoMatchTransaction,
} from "@/features/transactions/models/transaction-auto-match";
import { getFinancialPostingDeltaForLedgerAccount } from "@/modules/ledger";
import type { AccountType } from "@/modules/accounts/account-types";

const combinationPoolLimit = 40;
const duplicatePoolLimit = 80;
const suggestionLimit = 5;
const cutoffWindowDays = 7;
const millisecondsPerDay = 24 * 60 * 60 * 1_000;

type ReconciliationAccount = {
    accountId: string;
    accountType: AccountType;
    ledgerAccountId: string;
    name: string;
};

type ReconciliationTransaction = TransactionAutoMatchTransaction;

type AnalyzedTransaction = ReconciliationTransaction & {
    accountAmountCents: number;
    date: string;
};

type InternalSuggestion = AccountReconciliationMismatchSuggestion & {
    transactionIds: string[];
};

function analyzeTransactions(input: {
    account: ReconciliationAccount;
    transactions: ReconciliationTransaction[];
}) {
    return input.transactions.flatMap((transaction) => {
        if (transaction.status === "voided") {
            return [];
        }

        const accountAmountCents = getFinancialPostingDeltaForLedgerAccount({
            ledgerAccountId: input.account.ledgerAccountId,
            postings: transaction.postings,
        });

        if (accountAmountCents === null || accountAmountCents === 0) {
            return [];
        }

        return [{
            ...transaction,
            accountAmountCents,
            date: transaction.occurredAt.slice(0, 10),
        }];
    });
}

function compareCandidateTransactions(
    left: AnalyzedTransaction,
    right: AnalyzedTransaction,
) {
    return (
        Number(left.status === "reconciled") -
            Number(right.status === "reconciled") ||
        right.date.localeCompare(left.date) ||
        right.transactionId.localeCompare(left.transactionId)
    );
}

function getMismatchTransactionPools(input: {
    account: ReconciliationAccount;
    cutoffDate: string;
    transactions: ReconciliationTransaction[];
}) {
    const analyzedTransactions = analyzeTransactions(input);
    const includedTransactions = analyzedTransactions.filter(
        (transaction) =>
            transaction.status !== "reconciled" &&
            transaction.date <= input.cutoffDate,
    );
    const cutoffTransactions = analyzedTransactions.filter((transaction) => {
        const dayDistance = getDayDistanceFromCutoff(
            transaction.date,
            input.cutoffDate,
        );

        return (
            transaction.status !== "reconciled" &&
            dayDistance > 0 &&
            dayDistance <= cutoffWindowDays
        );
    });

    return {
        analyzedTransactions,
        cutoffTransactions,
        includedTransactions,
    };
}

function selectDuplicateCandidateTransactions(
    transactions: AnalyzedTransaction[],
) {
    return [...transactions]
        .sort(compareCandidateTransactions)
        .slice(0, duplicatePoolLimit);
}

export function getAccountReconciliationMismatchHydrationTransactionIds(input: {
    account: ReconciliationAccount;
    cutoffDate: string;
    transactions: ReconciliationTransaction[];
}) {
    return selectDuplicateCandidateTransactions(
        getMismatchTransactionPools(input).includedTransactions,
    ).map((transaction) => transaction.transactionId);
}

function getExactTransactionGroups(
    transactions: AnalyzedTransaction[],
    targetCents: number,
) {
    const groups: AnalyzedTransaction[][] = [];
    const sorted = [...transactions].sort(compareCandidateTransactions);

    for (const transaction of sorted) {
        if (transaction.accountAmountCents === targetCents) {
            groups.push([transaction]);
        }
    }

    const combinationPool = sorted.slice(0, combinationPoolLimit);

    for (let leftIndex = 0; leftIndex < combinationPool.length; leftIndex += 1) {
        const left = combinationPool[leftIndex];

        if (!left) {
            continue;
        }

        for (
            let rightIndex = leftIndex + 1;
            rightIndex < combinationPool.length;
            rightIndex += 1
        ) {
            const right = combinationPool[rightIndex];

            if (
                right &&
                left.accountAmountCents + right.accountAmountCents === targetCents
            ) {
                groups.push([left, right]);
            }
        }
    }

    for (let firstIndex = 0; firstIndex < combinationPool.length; firstIndex += 1) {
        const first = combinationPool[firstIndex];

        if (!first) {
            continue;
        }

        for (
            let secondIndex = firstIndex + 1;
            secondIndex < combinationPool.length;
            secondIndex += 1
        ) {
            const second = combinationPool[secondIndex];

            if (!second) {
                continue;
            }

            for (
                let thirdIndex = secondIndex + 1;
                thirdIndex < combinationPool.length;
                thirdIndex += 1
            ) {
                const third = combinationPool[thirdIndex];

                if (
                    third &&
                    first.accountAmountCents +
                        second.accountAmountCents +
                        third.accountAmountCents ===
                        targetCents
                ) {
                    groups.push([first, second, third]);
                }
            }
        }
    }

    return groups;
}

function toReportTransaction(
    transaction: AnalyzedTransaction,
): AccountReconciliationMismatchTransaction {
    return {
        amountCents: transaction.accountAmountCents,
        occurredAt: transaction.date,
        payee: transaction.payee,
        source: transaction.source ?? "manual",
        status: transaction.status === "entered" ? "entered" : "cleared",
    };
}

function toInternalSuggestion(input: {
    apparentDuplicateCount?: number;
    confidence: InternalSuggestion["confidence"];
    reason: InternalSuggestion["reason"];
    transactions: AnalyzedTransaction[];
}): InternalSuggestion {
    return {
        ...(input.apparentDuplicateCount === undefined
            ? {}
            : { apparentDuplicateCount: input.apparentDuplicateCount }),
        confidence: input.confidence,
        reason: input.reason,
        transactionIds: input.transactions
            .map((transaction) => transaction.transactionId)
            .sort(),
        transactions: input.transactions.map(toReportTransaction),
    };
}

function createDuplicateClusterSuggestions(input: {
    account: ReconciliationAccount;
    differenceCents: number;
    transactions: AnalyzedTransaction[];
}) {
    const transactions = selectDuplicateCandidateTransactions(
        input.transactions,
    );
    const analyzedById = new Map(
        transactions.map((transaction) => [transaction.transactionId, transaction]),
    );
    const matches = findTransactionAutoMatches({
        accounts: [input.account],
        accountId: input.account.accountId,
        transactions,
    });

    const adjacentTransactionIds = new Map<string, Set<string>>();

    for (const pair of [...matches.readyPairs, ...matches.ambiguousPairs]) {
        if (pair.matchType !== "duplicate") {
            continue;
        }

        const left = analyzedById.get(pair.left.transactionId);
        const right = analyzedById.get(pair.right.transactionId);

        if (
            !left ||
            !right ||
            left.accountAmountCents !== right.accountAmountCents
        ) {
            continue;
        }

        const leftAdjacentIds = adjacentTransactionIds.get(left.transactionId) ?? new Set();
        leftAdjacentIds.add(right.transactionId);
        adjacentTransactionIds.set(left.transactionId, leftAdjacentIds);

        const rightAdjacentIds = adjacentTransactionIds.get(right.transactionId) ?? new Set();
        rightAdjacentIds.add(left.transactionId);
        adjacentTransactionIds.set(right.transactionId, rightAdjacentIds);
    }

    const visitedTransactionIds = new Set<string>();
    const transactionIds = [...adjacentTransactionIds.keys()].sort((leftId, rightId) => {
        const left = analyzedById.get(leftId)!;
        const right = analyzedById.get(rightId)!;

        return compareCandidateTransactions(left, right);
    });
    const suggestions: InternalSuggestion[] = [];

    for (const transactionId of transactionIds) {
        if (visitedTransactionIds.has(transactionId)) {
            continue;
        }

        const componentIds = new Set<string>();
        const pendingTransactionIds = [transactionId];

        while (pendingTransactionIds.length > 0) {
            const pendingTransactionId = pendingTransactionIds.pop();

            if (!pendingTransactionId || visitedTransactionIds.has(pendingTransactionId)) {
                continue;
            }

            visitedTransactionIds.add(pendingTransactionId);
            componentIds.add(pendingTransactionId);

            for (const adjacentTransactionId of adjacentTransactionIds.get(
                pendingTransactionId,
            ) ?? []) {
                if (!visitedTransactionIds.has(adjacentTransactionId)) {
                    pendingTransactionIds.push(adjacentTransactionId);
                }
            }
        }

        const componentTransactions = [...componentIds]
            .map((componentTransactionId) => analyzedById.get(componentTransactionId))
            .filter((transaction): transaction is AnalyzedTransaction => Boolean(transaction))
            .sort(compareCandidateTransactions);
        const accountAmountCents = componentTransactions[0]?.accountAmountCents;

        if (
            componentTransactions.length < 2 ||
            !accountAmountCents ||
            input.differenceCents % -accountAmountCents !== 0
        ) {
            continue;
        }

        const apparentDuplicateCount = input.differenceCents / -accountAmountCents;

        if (
            apparentDuplicateCount < 1 ||
            apparentDuplicateCount > componentTransactions.length - 1
        ) {
            continue;
        }

        suggestions.push(
            toInternalSuggestion({
                apparentDuplicateCount,
                confidence: "high",
                reason: "possibleDuplicateGroup",
                transactions: componentTransactions,
            }),
        );
    }

    return suggestions;
}

function getDayDistanceFromCutoff(date: string, cutoffDate: string) {
    const timestamp = Date.parse(`${date}T00:00:00.000Z`);
    const cutoffTimestamp = Date.parse(`${cutoffDate}T00:00:00.000Z`);

    if (!Number.isFinite(timestamp) || !Number.isFinite(cutoffTimestamp)) {
        return Number.POSITIVE_INFINITY;
    }

    return (timestamp - cutoffTimestamp) / millisecondsPerDay;
}

function suggestionKey(suggestion: InternalSuggestion) {
    return suggestion.transactionIds.join(":");
}

function toPublicSuggestion(
    suggestion: InternalSuggestion,
): AccountReconciliationMismatchSuggestion {
    return {
        ...(suggestion.apparentDuplicateCount === undefined
            ? {}
            : { apparentDuplicateCount: suggestion.apparentDuplicateCount }),
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        transactions: suggestion.transactions,
    };
}

export function findAccountReconciliationMismatchSuggestions(input: {
    account: ReconciliationAccount;
    cutoffDate: string;
    differenceCents: number;
    transactions: ReconciliationTransaction[];
}): AccountReconciliationMismatchSuggestion[] {
    if (input.differenceCents === 0) {
        return [];
    }

    const {
        analyzedTransactions,
        cutoffTransactions,
        includedTransactions,
    } = getMismatchTransactionPools(input);
    const duplicateSuggestions = createDuplicateClusterSuggestions({
        account: input.account,
        differenceCents: input.differenceCents,
        transactions: includedTransactions,
    });
    const suggestions: InternalSuggestion[] = [...duplicateSuggestions];
    const duplicateTransactionIdClusters = duplicateSuggestions.map(
        (suggestion) => new Set(suggestion.transactionIds),
    );

    for (const group of getExactTransactionGroups(
        includedTransactions,
        -input.differenceCents,
    )) {
        const groupTransactionIds = group.map((transaction) => transaction.transactionId);

        if (
            duplicateTransactionIdClusters.some((clusterTransactionIds) =>
                groupTransactionIds.every((transactionId) =>
                    clusterTransactionIds.has(transactionId),
                ),
            )
        ) {
            continue;
        }

        suggestions.push(
            toInternalSuggestion({
                confidence: group.length === 1 ? "high" : "medium",
                reason: "includedActivity",
                transactions: group,
            }),
        );
    }

    for (const group of getExactTransactionGroups(
        cutoffTransactions,
        input.differenceCents,
    )) {
        suggestions.push(
            toInternalSuggestion({
                confidence: "medium",
                reason: "cutoffActivity",
                transactions: group,
            }),
        );
    }

    const suggestedTransactionIds = new Set(
        suggestions.flatMap((suggestion) => suggestion.transactionIds),
    );
    const similarAmountTransactions = analyzedTransactions
        .filter((transaction) => {
            const dayDistance = Math.abs(
                getDayDistanceFromCutoff(transaction.date, input.cutoffDate),
            );

            return (
                transaction.status !== "reconciled" &&
                dayDistance <= cutoffWindowDays &&
                Math.abs(transaction.accountAmountCents) ===
                    Math.abs(input.differenceCents) &&
                !suggestedTransactionIds.has(transaction.transactionId)
            );
        })
        .sort(compareCandidateTransactions);

    for (const transaction of similarAmountTransactions) {
        suggestions.push(
            toInternalSuggestion({
                confidence: "low",
                reason: "similarAmount",
                transactions: [transaction],
            }),
        );
    }

    const seen = new Set<string>();

    return suggestions
        .filter((suggestion) => {
            const key = suggestionKey(suggestion);

            if (seen.has(key)) {
                return false;
            }

            seen.add(key);
            return true;
        })
        .slice(0, suggestionLimit)
        .map(toPublicSuggestion);
}
