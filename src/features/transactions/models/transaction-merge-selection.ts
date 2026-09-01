import { toDisplayTransactionLineCategoryId } from "@/features/transactions/models/transaction-line-normalization";
import {
    hasMultipleTransactionLines,
    hasTransferTransactionLine,
    isOneSidedAccountTransactionLine,
} from "@/features/transactions/models/transaction-shape";
import { normalizeOptionalString } from "@/lib/strings";

type MergeSelectionLine = {
    categoryId?: string | null;
    fromAccountId?: string | null;
    toAccountId?: string | null;
};

export type TransactionMergeSelectionState = {
    children: {
        lines: readonly MergeSelectionLine[];
    };
    plaidTransactionSyncRecords: readonly unknown[];
    transaction: {
        memo?: string;
        plaidTransactionSyncId?: string | null;
        source?: "manual" | "plaid" | "venmo";
        transactionId: string;
    };
};

export function transactionMergeStateHasPlaidMetadata(
    state: TransactionMergeSelectionState,
) {
    return (
        state.transaction.source === "plaid" ||
        Boolean(state.transaction.plaidTransactionSyncId) ||
        state.plaidTransactionSyncRecords.length > 0
    );
}

export function transactionMergeStateHasMultipleLines(
    state: TransactionMergeSelectionState,
) {
    return hasMultipleTransactionLines(state.children);
}

function transactionMergeStateHasTransferLine(
    state: TransactionMergeSelectionState,
) {
    return hasTransferTransactionLine(state.children);
}

function transactionMergeStateHasCategorizedAccountActivity(
    state: TransactionMergeSelectionState,
) {
    return state.children.lines.some(
        (line) =>
            isOneSidedAccountTransactionLine(line) &&
            Boolean(toDisplayTransactionLineCategoryId(line.categoryId)),
    );
}

export function selectDefinedTransactionMergeText(
    ...values: Array<string | undefined>
) {
    return values.find((value) => normalizeOptionalString(value));
}

export function selectTransactionMergeMemo<
    TState extends TransactionMergeSelectionState,
>(states: TState[], content: TState, survivor: TState) {
    return selectDefinedTransactionMergeText(
        content.transaction.memo,
        survivor.transaction.memo,
        ...states.map((state) => state.transaction.memo),
    );
}

export function chooseTransactionMergeSurvivor<
    TState extends TransactionMergeSelectionState,
>(states: TState[], requestedTransactionIds: string[]) {
    const plaidTransferState = states.find(
        (state) =>
            transactionMergeStateHasPlaidMetadata(state) &&
            transactionMergeStateHasTransferLine(state),
    );

    if (plaidTransferState) {
        return plaidTransferState;
    }

    const plaidState = states.find(transactionMergeStateHasPlaidMetadata);

    if (plaidState) {
        return plaidState;
    }

    return (
        requestedTransactionIds
            .map((transactionId) =>
                states.find(
                    (state) =>
                        state.transaction.transactionId === transactionId,
                ),
            )
            .find((state): state is TState => Boolean(state)) ?? states[0]
    );
}

export function chooseTransactionMergeContent<
    TState extends TransactionMergeSelectionState,
>(states: TState[], survivor: TState) {
    const multiLineState = states.find(
        transactionMergeStateHasMultipleLines,
    );

    if (multiLineState) {
        return multiLineState;
    }

    const transferState = states.find(transactionMergeStateHasTransferLine);

    if (transferState) {
        return transferState;
    }

    const categorizedState = states.find(
        transactionMergeStateHasCategorizedAccountActivity,
    );

    if (categorizedState) {
        return categorizedState;
    }

    return (
        states.find(
            (state) => !transactionMergeStateHasPlaidMetadata(state),
        ) ?? survivor
    );
}
