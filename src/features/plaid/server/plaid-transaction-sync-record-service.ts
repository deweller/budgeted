import type { PlaidTransactionSyncRecord } from "@/features/plaid/server/plaid-service";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";

export async function listPlaidTransactionSyncsForTransaction(
    ledgerId: string,
    transactionId: string,
    referencedPlaidTransactionSyncId?: string,
) {
    const { entities } = getBudgetedSchema();
    const [indexedRecords, referencedRecords] = await Promise.all([
        queryAllPages(
            entities.plaidTransactionSyncs.query.byTransaction({
                ledgerId,
                transactionId,
            }),
        ) as Promise<PlaidTransactionSyncRecord[]>,
        referencedPlaidTransactionSyncId
            ? getPlaidTransactionSyncRecordsByIds(ledgerId, [
                  referencedPlaidTransactionSyncId,
              ])
            : Promise.resolve([]),
    ]);
    const recordsById = new Map(
        indexedRecords.map((record) => [
            record.plaidTransactionSyncId,
            record,
        ]),
    );

    for (const record of referencedRecords) {
        recordsById.set(record.plaidTransactionSyncId, record);
    }

    return [...recordsById.values()];
}

export async function getPlaidTransactionSyncRecordsByIds(
    ledgerId: string,
    plaidTransactionSyncIds: readonly string[],
) {
    const { entities } = getBudgetedSchema();

    return (
        await Promise.all(
            [...new Set(plaidTransactionSyncIds)].map(async (plaidTransactionSyncId) =>
                (
                    await entities.plaidTransactionSyncs
                        .get({ ledgerId, plaidTransactionSyncId })
                        .go({ consistent: true })
                ).data,
            ),
        )
    ).filter(
        (record): record is PlaidTransactionSyncRecord => Boolean(record),
    );
}

export async function putPlaidTransactionSyncRecords(
    records: PlaidTransactionSyncRecord[],
) {
    const { entities } = getBudgetedSchema();

    await Promise.all(
        records.map((record) =>
            entities.plaidTransactionSyncs.put(record).go(),
        ),
    );
}

export async function deletePlaidTransactionSyncRecords(
    records: PlaidTransactionSyncRecord[],
) {
    const { entities } = getBudgetedSchema();

    await Promise.all(
        records.map((record) =>
            entities.plaidTransactionSyncs
                .delete({
                    ledgerId: record.ledgerId,
                    plaidTransactionSyncId: record.plaidTransactionSyncId,
                })
                .go(),
        ),
    );
}

export async function deletePlaidTransactionSyncsForTransaction(
    ledgerId: string,
    transactionId: string,
) {
    const records = await listPlaidTransactionSyncsForTransaction(
        ledgerId,
        transactionId,
    );

    await deletePlaidTransactionSyncRecords(records);
}

export async function movePlaidTransactionSyncRecordsToTransaction(input: {
    now: string;
    records: PlaidTransactionSyncRecord[];
    transactionId: string;
}) {
    await putPlaidTransactionSyncRecords(
        input.records.map((record) =>
            record.transactionId === input.transactionId
                ? record
                : {
                      ...record,
                      transactionId: input.transactionId,
                      updatedAt: input.now,
                  },
        ),
    );
}
