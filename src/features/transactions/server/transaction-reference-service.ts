import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import type { AccountType } from "@/modules/accounts/account-types";

export type TransactionReferenceAccount = {
    accountId: string;
    accountType: AccountType;
    ledgerAccountId: string;
    name: string;
};

export type TransactionReferenceCategory = {
    categoryId: string;
    ledgerAccountId: string;
    systemCategoryKey?: "startingBalances";
};

export type TransactionReferenceRecords = {
    accountById: Map<string, TransactionReferenceAccount>;
    accountIdByLedgerAccountId: Map<string, string>;
    accounts: TransactionReferenceAccount[];
    categories: TransactionReferenceCategory[];
    categoryById: Map<string, TransactionReferenceCategory>;
    categoryIdByLedgerAccountId: Map<string, string>;
};

export async function loadTransactionReferenceRecords(
    ledgerId: string,
): Promise<TransactionReferenceRecords> {
    const { entities } = getBudgetedSchema();
    const [accountsResult, categoriesResult] = await Promise.all([
        queryAllPages(entities.accounts.query.byAccount({ ledgerId }), {
            consistent: true,
        }),
        queryAllPages(
            entities.budgetCategories.query.byCategory({ ledgerId }),
            { consistent: true },
        ),
    ]);
    const accounts = accountsResult as TransactionReferenceAccount[];
    const categories = categoriesResult as TransactionReferenceCategory[];

    return {
        accountById: new Map(
            accounts.map((account) => [account.accountId, account]),
        ),
        accountIdByLedgerAccountId: new Map(
            accounts.map((account) => [
                account.ledgerAccountId,
                account.accountId,
            ]),
        ),
        accounts,
        categories,
        categoryById: new Map(
            categories.map((category) => [
                category.categoryId,
                category,
            ]),
        ),
        categoryIdByLedgerAccountId: new Map(
            categories.map((category) => [
                category.ledgerAccountId,
                category.categoryId,
            ]),
        ),
    };
}

export async function listAccountActivityTransactionIds(
    ledgerId: string,
    accountId: string,
) {
    const { entities } = getBudgetedSchema();
    const accounts = await queryAllPages(
        entities.accounts.query.byAccount({ ledgerId }),
        { consistent: true },
    );
    const account = accounts.find((record) => record.accountId === accountId);

    if (!account) {
        return new Set<string>();
    }

    const postings = await queryAllPages(
        entities.ledgerPostings.query.byLedgerAccount({
            ledgerId,
            ledgerAccountId: account.ledgerAccountId,
        }),
    );

    return new Set(postings.map((posting) => posting.transactionId));
}
