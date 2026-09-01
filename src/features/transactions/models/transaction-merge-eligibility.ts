import { hasMultipleTransactionLines } from "@/features/transactions/models/transaction-shape";
import type { TransactionImportActivityRecord } from "@/features/transaction-importers/models/transaction-importer-contract";

export type TransactionMergeEligibility =
    | {
            canMerge: false;
            reason: string;
        }
    | {
            canMerge: true;
            reason?: undefined;
        };

type MergeEligibleTransaction = {
    displayAmountCents: number;
    importActivities?: readonly TransactionImportActivityRecord[];
    lines: readonly unknown[];
    status?: "entered" | "cleared" | "reconciled" | "voided";
};

export function getTransactionMergeEligibility(
    transactions: readonly MergeEligibleTransaction[],
): TransactionMergeEligibility {
    if (transactions.length !== 2) {
        return {
            canMerge: false,
            reason: "Select exactly two transactions to merge.",
        };
    }

    const [left, right] = transactions;

    if (!left || !right) {
        return {
            canMerge: false,
            reason: "Select exactly two transactions to merge.",
        };
    }

    if (left.status === "voided" || right.status === "voided") {
        return {
            canMerge: false,
            reason: "Voided transactions cannot be merged.",
        };
    }

    if (left.status === "reconciled" || right.status === "reconciled") {
        return {
            canMerge: false,
            reason: "Reconciled transactions must be unlocked before merging.",
        };
    }

    if (
        Math.abs(left.displayAmountCents) !== Math.abs(right.displayAmountCents)
    ) {
        return {
            canMerge: false,
            reason: "Selected transactions must have matching amounts.",
        };
    }

    if (hasMultipleTransactionLines(left) && hasMultipleTransactionLines(right)) {
        return {
            canMerge: false,
            reason: "Two multi-line transactions cannot be merged together.",
        };
    }

    const activitiesByProvider = new Map<string, Set<string>>();
    for (const activity of [
        ...(left.importActivities ?? []),
        ...(right.importActivities ?? []),
    ]) {
        const activityIds =
            activitiesByProvider.get(activity.provider) ?? new Set<string>();
        activityIds.add(activity.activityId);
        activitiesByProvider.set(activity.provider, activityIds);
    }
    const conflictingProvider = Array.from(activitiesByProvider.entries()).find(
        ([, activityIds]) => activityIds.size > 1,
    )?.[0];

    if (conflictingProvider) {
        return {
            canMerge: false,
            reason: `Transactions from different ${conflictingProvider} importer activities cannot be merged.`,
        };
    }

    return { canMerge: true };
}
