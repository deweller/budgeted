import { toTransactionReference } from "@/features/transactions/models/transaction-reference";
import { listStoredTransactionsByIds } from "@/features/transactions/server/transaction-query-service";
import { listTransactionLinesForTransaction } from "@/features/transactions/server/transaction-line-service";

const directTransactionReferenceChunkSize = 10;

function chunkTransactionIds(transactionIds: readonly string[]) {
    return Array.from(
        {
            length: Math.ceil(
                transactionIds.length / directTransactionReferenceChunkSize,
            ),
        },
        (_, index) =>
            transactionIds.slice(
                index * directTransactionReferenceChunkSize,
                (index + 1) * directTransactionReferenceChunkSize,
            ),
    );
}

export async function listTransactionReferences(
    ledgerId: string,
    transactionIds: readonly string[],
) {
    const uniqueTransactionIds = [...new Set(transactionIds)];
    const transactions = (
        await Promise.all(
            chunkTransactionIds(uniqueTransactionIds).map((transactionIdChunk) =>
                listStoredTransactionsByIds(ledgerId, transactionIdChunk),
            ),
        )
    ).flat();
    const linesByTransactionId = new Map(
        await Promise.all(
            transactions.map(
                async (transaction) =>
                    [
                        transaction.transactionId,
                        await listTransactionLinesForTransaction(
                            ledgerId,
                            transaction.transactionId,
                        ),
                    ] as const,
            ),
        ),
    );
    const transactionById = new Map(
        transactions.map((transaction) => [
            transaction.transactionId,
            transaction,
        ]),
    );

    return uniqueTransactionIds.flatMap((transactionId) => {
        const transaction = transactionById.get(transactionId);

        return transaction
            ? [
                  toTransactionReference({
                      ...transaction,
                      lines:
                          linesByTransactionId.get(transaction.transactionId) ??
                          [],
                  }),
              ]
            : [];
    });
}
