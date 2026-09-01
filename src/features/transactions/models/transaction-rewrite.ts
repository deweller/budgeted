import type {
    TransactionInput,
    TransactionLineInput,
} from "@/features/transactions/models/transaction-form";

type RewriteSource = "manual" | "plaid" | "venmo";

type RewritableTransaction = Pick<
    TransactionInput,
    "kind" | "memo" | "occurredAt" | "payee"
> & {
    plaidTransactionSyncId?: string;
    referenceAccountId: string;
    source?: RewriteSource;
    transactionId: string;
};

export type TransactionRewriteInput = TransactionInput & {
    plaidTransactionSyncId?: string | null;
    source?: RewriteSource;
    transactionId: string;
};

export function createTransactionRewriteInput(input: {
    accountId?: string;
    lines: TransactionLineInput[];
    plaidTransactionSyncId?: string | null;
    source?: RewriteSource;
    transaction: RewritableTransaction;
}): TransactionRewriteInput {
    return {
        accountId: input.accountId ?? input.transaction.referenceAccountId,
        kind: input.transaction.kind,
        lines: input.lines,
        memo: input.transaction.memo,
        occurredAt: input.transaction.occurredAt,
        payee: input.transaction.payee,
        plaidTransactionSyncId:
            input.plaidTransactionSyncId !== undefined
                ? input.plaidTransactionSyncId
                : input.transaction.plaidTransactionSyncId,
        source: input.source ?? input.transaction.source,
        transactionId: input.transaction.transactionId,
    };
}
