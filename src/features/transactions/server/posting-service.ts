import { ulid } from "ulid";

import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import {
    assertValidTransactionPostings,
    type TransactionPostingInput,
} from "@/modules/ledger";

export type PersistedPosting = TransactionPostingInput & {
    createdAt: string;
    occurredAt: string;
    periodId: string;
    postingId: string;
    transactionId: string;
    ledgerId: string;
};

export function createLedgerPostingRecords(input: {
    createdAt?: string;
    occurredAt: string;
    periodId: string;
    postings: TransactionPostingInput[];
    transactionId: string;
    ledgerId: string;
}): PersistedPosting[] {
    const createdAt = input.createdAt ?? new Date().toISOString();

    return input.postings.map((posting) => ({
        ...posting,
        postingId: ulid(),
        transactionId: input.transactionId,
        ledgerId: input.ledgerId,
        occurredAt: input.occurredAt,
        periodId: input.periodId,
        createdAt,
    }));
}

export async function resolveTransactionReferences(
    ledgerId: string,
    postings: TransactionPostingInput[],
    referenceLedgerAccountId?: string,
) {
    assertValidTransactionPostings({ postings });

    const { entities } = getBudgetedSchema();
    const [accounts, categories] = await Promise.all([
        queryAllPages(entities.accounts.query.byAccount({ ledgerId }), {
            consistent: true,
        }),
        queryAllPages(entities.budgetCategories.query.byCategory({ ledgerId }), {
            consistent: true,
        }),
    ]);
    const accountIdByLedgerAccountId = new Map(
        accounts.map((account) => [
            account.ledgerAccountId,
            account.accountId,
        ]),
    );
    const categoryIdByLedgerAccountId = new Map(
        categories.map((category) => [
            category.ledgerAccountId,
            category.categoryId,
        ]),
    );

    for (const posting of postings) {
        if (
            posting.ledgerAccountKind === "financial" &&
            !accountIdByLedgerAccountId.has(posting.ledgerAccountId)
        ) {
            throw new HttpError(
                404,
                "account_missing",
                "One or more transaction postings reference a missing account.",
            );
        }

        if (
            posting.ledgerAccountKind === "category" &&
            !categoryIdByLedgerAccountId.has(posting.ledgerAccountId)
        ) {
            throw new HttpError(
                404,
                "category_missing",
                "One or more transaction postings reference a missing category.",
            );
        }
    }

    const referenceFinancialPosting =
        postings.find(
            (posting) =>
                posting.ledgerAccountKind === "financial" &&
                posting.ledgerAccountId === referenceLedgerAccountId,
        ) ??
        postings.find((posting) => posting.ledgerAccountKind === "financial");

    if (!referenceFinancialPosting) {
        throw new HttpError(
            422,
            "posting_validation_error",
            "Transactions must include a financial account posting.",
        );
    }

    const referenceCategoryPosting = postings.find(
        (posting) => posting.ledgerAccountKind === "category",
    );

    return {
        referenceAccountId: accountIdByLedgerAccountId.get(
            referenceFinancialPosting.ledgerAccountId,
        )!,
        referenceCategoryId: referenceCategoryPosting
            ? (categoryIdByLedgerAccountId.get(
                  referenceCategoryPosting.ledgerAccountId,
              ) ?? null)
            : null,
    };
}

export async function listLedgerPostingsForTransaction(
    ledgerId: string,
    transactionId: string,
) {
    const { entities } = getBudgetedSchema();
    const postings = await queryAllPages(
        entities.ledgerPostings.query
            .byPosting({ ledgerId })
            .begins({ transactionId }),
        { consistent: true },
    );

    return postings;
}

export async function listLedgerPostingsForLedgerAccount(
    ledgerId: string,
    ledgerAccountId: string,
) {
    const { entities } = getBudgetedSchema();

    return queryAllPages(
        entities.ledgerPostings.query.byLedgerAccount({
            ledgerId,
            ledgerAccountId,
        }),
    ) as Promise<PersistedPosting[]>;
}

export async function persistLedgerPostings(input: {
    occurredAt: string;
    periodId: string;
    postings: TransactionPostingInput[];
    transactionId: string;
    ledgerId: string;
}) {
    const { entities } = getBudgetedSchema();
    const records = createLedgerPostingRecords(input);

    await Promise.all(
        records.map((record) => entities.ledgerPostings.put(record).go()),
    );

    return records;
}

export async function replaceLedgerPostings(input: {
    occurredAt: string;
    periodId: string;
    postings: TransactionPostingInput[];
    transactionId: string;
    ledgerId: string;
}) {
    const { entities } = getBudgetedSchema();
    const existing = await listLedgerPostingsForTransaction(
        input.ledgerId,
        input.transactionId,
    );

    await Promise.all(
        existing.map((posting) =>
            entities.ledgerPostings
                .delete({
                    ledgerId: input.ledgerId,
                    transactionId: posting.transactionId,
                    postingId: posting.postingId,
                })
                .go(),
        ),
    );

    return persistLedgerPostings(input);
}

export async function removeLedgerPostings(
    ledgerId: string,
    transactionId: string,
) {
    const { entities } = getBudgetedSchema();
    const existing = await listLedgerPostingsForTransaction(
        ledgerId,
        transactionId,
    );

    await Promise.all(
        existing.map((posting) =>
            entities.ledgerPostings
                .delete({
                    ledgerId,
                    transactionId: posting.transactionId,
                    postingId: posting.postingId,
                })
                .go(),
        ),
    );

    return existing;
}
