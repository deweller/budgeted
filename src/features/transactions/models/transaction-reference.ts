import { z } from "zod";

import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";

export const transactionReferencesRequestSchema = z.object({
    transactionIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

export type TransactionReference = {
    accountIds: string[];
    displayAmountCents: number;
    occurredAt: string;
    payee?: string;
    transactionId: string;
};

export function toTransactionReference(
    transaction: Pick<
        TransactionWithPostings,
        | "displayAmountCents"
        | "lines"
        | "occurredAt"
        | "payee"
        | "referenceAccountId"
        | "transactionId"
    >,
): TransactionReference {
    return {
        accountIds: [
            ...new Set(
                [
                    transaction.referenceAccountId,
                    ...transaction.lines.flatMap((line) => [
                        line.fromAccountId,
                        line.toAccountId,
                    ]),
                ].filter((accountId): accountId is string => Boolean(accountId)),
            ),
        ],
        displayAmountCents: transaction.displayAmountCents,
        occurredAt: transaction.occurredAt,
        payee: transaction.payee,
        transactionId: transaction.transactionId,
    };
}
