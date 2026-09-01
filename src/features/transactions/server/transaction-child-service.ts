import { normalizeTransactionIds } from "@/features/transactions/models/transaction-ids";
import {
    listLedgerPostingsForTransaction,
    removeLedgerPostings,
    type PersistedPosting,
} from "@/features/transactions/server/posting-service";
import {
    listTransactionLinesForTransaction,
    removeTransactionLines,
    toStoredTransactionLineRecord,
    type PersistedTransactionLine,
} from "@/features/transactions/server/transaction-line-service";
import { getBudgetedSchema } from "@/lib/db/schema";

export type TransactionChildRecords = {
    lines: PersistedTransactionLine[];
    postings: PersistedPosting[];
};

export type TransactionChildRecordMaps = {
    linesByTransactionId: Map<string, PersistedTransactionLine[]>;
    postingsByTransactionId: Map<string, PersistedPosting[]>;
};

export async function listTransactionChildren(
    ledgerId: string,
    transactionId: string,
): Promise<TransactionChildRecords> {
    const [postings, lines] = await Promise.all([
        listLedgerPostingsForTransaction(ledgerId, transactionId),
        listTransactionLinesForTransaction(ledgerId, transactionId),
    ]);

    return { lines, postings };
}

export async function listTransactionChildrenByTransactionId(
    ledgerId: string,
    transactionIds: Iterable<string>,
): Promise<TransactionChildRecordMaps> {
    const ids = normalizeTransactionIds(transactionIds);
    const [postingPairs, linePairs] = await Promise.all([
        Promise.all(
            ids.map(
                async (transactionId) =>
                    [
                        transactionId,
                        await listLedgerPostingsForTransaction(
                            ledgerId,
                            transactionId,
                        ),
                    ] as const,
            ),
        ),
        Promise.all(
            ids.map(
                async (transactionId) =>
                    [
                        transactionId,
                        await listTransactionLinesForTransaction(
                            ledgerId,
                            transactionId,
                        ),
                    ] as const,
            ),
        ),
    ]);

    return {
        linesByTransactionId: new Map(linePairs),
        postingsByTransactionId: new Map(postingPairs),
    };
}

export async function removeTransactionChildren(
    ledgerId: string,
    transactionId: string,
) {
    const [postings, lines] = await Promise.all([
        removeLedgerPostings(ledgerId, transactionId),
        removeTransactionLines(ledgerId, transactionId),
    ]);

    return { postings, lines };
}

export async function restoreTransactionChildren(
    children: TransactionChildRecords,
) {
    const { entities } = getBudgetedSchema();

    await Promise.all([
        ...children.postings.map((posting) =>
            entities.ledgerPostings.put(posting).go(),
        ),
        ...children.lines.map((line) =>
            entities.transactionLines
                .put(toStoredTransactionLineRecord(line))
                .go(),
        ),
    ]);
}
