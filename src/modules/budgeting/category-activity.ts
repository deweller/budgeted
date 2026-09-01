import {
    isBudgetCategoryActivityAccountType,
    type AccountType,
} from "@/modules/accounts/account-types";

type CategoryActivityAccount = {
    accountId: string;
    accountType: AccountType;
};

type CategoryActivityCategory = {
    categoryId: string;
};

type CategoryActivityTransaction = {
    kind?: "adjustment" | "standard";
    periodId: string;
    status?: "cleared" | "entered" | "reconciled" | "voided";
    transactionId: string;
};

type CategoryActivityLine = {
    amountCents: number;
    categoryId?: string;
    fromAccountId?: string;
    toAccountId?: string;
    transactionId: string;
};

export function buildCategoryActivityByCategoryId(input: {
    accounts: CategoryActivityAccount[];
    categories: CategoryActivityCategory[];
    lines: CategoryActivityLine[];
    periodId: string;
    transactions: CategoryActivityTransaction[];
}) {
    const accountById = new Map(
        input.accounts.map((account) => [account.accountId, account]),
    );
    const categoryIds = new Set(
        input.categories.map((category) => category.categoryId),
    );
    const transactionById = new Map(
        input.transactions.map((transaction) => [
            transaction.transactionId,
            transaction,
        ]),
    );
    const activityByCategoryId = new Map<string, number>();

    for (const line of input.lines) {
        const transaction = transactionById.get(line.transactionId);

        if (
            !transaction ||
            transaction.periodId !== input.periodId ||
            transaction.status === "voided" ||
            transaction.kind === "adjustment" ||
            !line.categoryId ||
            !categoryIds.has(line.categoryId)
        ) {
            continue;
        }

        if (line.fromAccountId && line.toAccountId) {
            continue;
        }

        const accountId = line.fromAccountId ?? line.toAccountId;
        const account = accountId ? accountById.get(accountId) : undefined;

        if (
            !account ||
            !isBudgetCategoryActivityAccountType(account.accountType)
        ) {
            continue;
        }

        const activityCents = line.toAccountId
            ? line.amountCents
            : -line.amountCents;

        activityByCategoryId.set(
            line.categoryId,
            (activityByCategoryId.get(line.categoryId) ?? 0) + activityCents,
        );
    }

    return activityByCategoryId;
}

export function buildCategoryTransactionCountByCategoryId(input: {
    accounts: CategoryActivityAccount[];
    categories: CategoryActivityCategory[];
    lines: CategoryActivityLine[];
    transactions: CategoryActivityTransaction[];
}) {
    const accountById = new Map(
        input.accounts.map((account) => [account.accountId, account]),
    );
    const categoryIds = new Set(
        input.categories.map((category) => category.categoryId),
    );
    const transactionById = new Map(
        input.transactions.map((transaction) => [
            transaction.transactionId,
            transaction,
        ]),
    );
    const transactionIdsByCategoryId = new Map<string, Set<string>>();

    for (const line of input.lines) {
        const transaction = transactionById.get(line.transactionId);

        if (
            !transaction ||
            transaction.status === "voided" ||
            transaction.kind === "adjustment" ||
            !line.categoryId ||
            !categoryIds.has(line.categoryId) ||
            (line.fromAccountId && line.toAccountId)
        ) {
            continue;
        }

        const accountId = line.fromAccountId ?? line.toAccountId;
        const account = accountId ? accountById.get(accountId) : undefined;

        if (
            !account ||
            !isBudgetCategoryActivityAccountType(account.accountType)
        ) {
            continue;
        }

        const transactionIds =
            transactionIdsByCategoryId.get(line.categoryId) ?? new Set<string>();
        transactionIds.add(line.transactionId);
        transactionIdsByCategoryId.set(line.categoryId, transactionIds);
    }

    return new Map(
        Array.from(transactionIdsByCategoryId, ([categoryId, transactionIds]) => [
            categoryId,
            transactionIds.size,
        ]),
    );
}

export function calculateUncategorizedActivityCents(input: {
    accounts: CategoryActivityAccount[];
    lines: CategoryActivityLine[];
    periodId: string;
    transactions: CategoryActivityTransaction[];
}) {
    const accountById = new Map(
        input.accounts.map((account) => [account.accountId, account]),
    );
    const transactionById = new Map(
        input.transactions.map((transaction) => [
            transaction.transactionId,
            transaction,
        ]),
    );
    let activityCents = 0;

    for (const line of input.lines) {
        const transaction = transactionById.get(line.transactionId);

        if (
            !transaction ||
            transaction.periodId !== input.periodId ||
            transaction.status === "voided" ||
            transaction.kind === "adjustment" ||
            line.categoryId ||
            Boolean(line.fromAccountId) === Boolean(line.toAccountId)
        ) {
            continue;
        }

        const accountId = line.fromAccountId ?? line.toAccountId;
        const account = accountId ? accountById.get(accountId) : undefined;

        if (
            !account ||
            !isBudgetCategoryActivityAccountType(account.accountType)
        ) {
            continue;
        }

        activityCents += line.toAccountId ? line.amountCents : -line.amountCents;
    }

    return activityCents;
}
