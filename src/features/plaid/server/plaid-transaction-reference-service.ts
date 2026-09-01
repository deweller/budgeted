import { toPlaidTransactionReference } from "@/features/plaid/models/plaid-transaction-reference";
import { listPlaidTransactionSyncsForTransaction } from "@/features/plaid/server/plaid-transaction-sync-record-service";
import { getStoredTransaction } from "@/features/transactions/server/transaction-query-service";

export async function getPlaidTransactionReference(
    ledgerId: string,
    transactionId: string,
) {
    const transaction = await getStoredTransaction(ledgerId, transactionId);

    if (!transaction.plaidTransactionSyncId) {
        return null;
    }

    const records = await listPlaidTransactionSyncsForTransaction(
        ledgerId,
        transactionId,
        transaction.plaidTransactionSyncId,
    );
    const record = records.find(
        (candidate) =>
            candidate.plaidTransactionSyncId === transaction.plaidTransactionSyncId,
    );

    return record
        ? toPlaidTransactionReference(record, transaction.displayAmountCents)
        : null;
}
