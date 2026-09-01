import type { TransactionClassificationPendingPublic } from "@/features/transaction-classification/models/transaction-classification";
import {
    toDisplayTransactionLineCategoryId,
} from "@/features/transactions/models/transaction-line-normalization";
import {
    createOptimisticTransactionChanges,
} from "@/features/transactions/models/optimistic-transaction";
import type {
    TransactionInput,
    TransactionLineInput,
} from "@/features/transactions/models/transaction-form";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import type { AccountType } from "@/modules/accounts/account-types";

export type PendingClassificationFieldSelection = {
    applySuggestedMemo: boolean;
    applySuggestedPayee: boolean;
};

type OptimisticPendingClassificationAccount = {
    accountId: string;
    accountType: AccountType;
    ledgerAccountId: string;
    name: string;
};

type OptimisticPendingClassificationCategory = {
    categoryId: string;
    ledgerAccountId: string;
};

function toOptimisticTransactionLineInput(
    line: TransactionWithPostings["lines"][number],
): TransactionLineInput {
    return {
        amountCents: line.amountCents,
        categoryId: toDisplayTransactionLineCategoryId(line.categoryId),
        fromAccountId: line.fromAccountId,
        lineId: line.lineId,
        memo: line.memo,
        payee: line.payee,
        sortOrder: line.sortOrder,
        toAccountId: line.toAccountId,
    };
}

function buildCategoryPendingClassificationLines(
    pending: TransactionClassificationPendingPublic,
    transaction: TransactionWithPostings,
): TransactionLineInput[] {
    const targetLineIds = new Set(pending.suggestion.targetLineIds);
    const assignmentsByLineId = new Map(
        pending.suggestion.lineAssignments.map((assignment) => [
            assignment.lineId,
            assignment.categoryId,
        ]),
    );

    return transaction.lines.map((line) => {
        const lineInput = toOptimisticTransactionLineInput(line);

        if (!targetLineIds.has(line.lineId)) {
            return lineInput;
        }

        return {
            ...lineInput,
            categoryId: assignmentsByLineId.get(line.lineId),
        };
    });
}

export function createOptimisticPendingClassificationChanges(input: {
    accounts: OptimisticPendingClassificationAccount[];
    categories: OptimisticPendingClassificationCategory[];
    fieldSelection: PendingClassificationFieldSelection;
    pending: TransactionClassificationPendingPublic;
    transaction: TransactionWithPostings;
}) {
    if (input.pending.suggestion.type === "noSuggestion") {
        return [];
    }

    const transactionInput: TransactionInput = {
        accountId: input.transaction.referenceAccountId,
        kind: input.transaction.kind,
        lines: buildCategoryPendingClassificationLines(
            input.pending,
            input.transaction,
        ),
        memo:
            input.fieldSelection.applySuggestedMemo &&
            input.pending.suggestion.suggestedMemo
                ? input.pending.suggestion.suggestedMemo
                : (input.transaction.memo ?? ""),
        occurredAt: input.transaction.occurredAt,
        payee:
            input.fieldSelection.applySuggestedPayee &&
            input.pending.suggestion.suggestedPayee
                ? input.pending.suggestion.suggestedPayee
                : (input.transaction.payee ?? ""),
    };

    return createOptimisticTransactionChanges({
        accounts: input.accounts,
        categories: input.categories,
        input: transactionInput,
        transaction: input.transaction,
    });
}
