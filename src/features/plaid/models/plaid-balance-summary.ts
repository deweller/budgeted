import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import { getComparablePlaidBalanceCents } from "@/features/plaid/models/plaid-balance";
import type {
    WorkspaceLedgerPostingRecord,
    WorkspacePlaidAccountLinkRecord,
    WorkspaceTransactionRecord,
} from "@/lib/workspace/sync-types";
import { calculateAccountBalanceCents } from "@/modules/ledger/account-balance";

export type PlaidBalanceSummary = {
    differenceCents?: number;
    institutionBalanceCents?: number;
    lastSyncedAt?: string;
    syncError?: string;
};

function hasFinancialPostingsForAccount(input: {
    account: AccountWithBalance;
    ledgerPostings: WorkspaceLedgerPostingRecord[];
}) {
    return input.ledgerPostings.some(
        (posting) =>
            posting.ledgerAccountKind === "financial" &&
            posting.ledgerAccountId === input.account.ledgerAccountId,
    );
}

function calculateTransactionFallbackBalanceCents(input: {
    account: AccountWithBalance;
    transactions: WorkspaceTransactionRecord[];
}) {
    const transactionTotalCents = input.transactions
        .filter(
            (transaction) =>
                transaction.referenceAccountId === input.account.accountId &&
                transaction.status !== "voided",
        )
        .reduce(
            (total, transaction) => total + transaction.displayAmountCents,
            0,
        );

    return input.account.openingBalanceCents + transactionTotalCents;
}

export function getLocalBalanceCents(input: {
    account: AccountWithBalance;
    ledgerPostings: WorkspaceLedgerPostingRecord[];
    transactions: WorkspaceTransactionRecord[];
}) {
    const calculatedBalanceCents = calculateAccountBalanceCents(
        input.account,
        input.ledgerPostings,
    );

    if (
        hasFinancialPostingsForAccount({
            account: input.account,
            ledgerPostings: input.ledgerPostings,
        })
    ) {
        return calculatedBalanceCents;
    }

    if (
        input.transactions.some(
            (transaction) =>
                transaction.referenceAccountId === input.account.accountId &&
                transaction.status !== "voided",
        )
    ) {
        return calculateTransactionFallbackBalanceCents(input);
    }

    return input.account.balanceCents ?? calculatedBalanceCents;
}

export function getPlaidBalanceSummary(input: {
    account: AccountWithBalance;
    localBalanceCents: number;
    link?: Pick<
        WorkspacePlaidAccountLinkRecord,
        | "plaidAccountSubtype"
        | "plaidAccountType"
        | "plaidBalanceCurrentCents"
        | "plaidBalanceLastSyncedAt"
        | "plaidBalanceSyncError"
    >;
}): PlaidBalanceSummary {
    const plaidBalanceCurrentCents =
        input.link?.plaidBalanceCurrentCents ??
        input.account.plaidBalanceCurrentCents;
    const institutionBalanceCents = getComparablePlaidBalanceCents({
        accountType: input.account.accountType,
        plaidAccountSubtype:
            input.link?.plaidAccountSubtype ??
            input.account.plaidAccountSubtype,
        plaidAccountType: input.link?.plaidAccountType,
        plaidBalanceCurrentCents,
    });

    return {
        differenceCents:
            typeof institutionBalanceCents === "number"
                ? input.localBalanceCents - institutionBalanceCents
                : undefined,
        institutionBalanceCents,
        lastSyncedAt:
            input.link?.plaidBalanceLastSyncedAt ??
            input.account.plaidBalanceLastSyncedAt,
        syncError:
            input.link?.plaidBalanceSyncError ??
            input.account.plaidBalanceSyncError,
    };
}

export function findActivePlaidAccountLink(
    account: AccountWithBalance,
    links: WorkspacePlaidAccountLinkRecord[],
) {
    const bySummaryId = account.plaidAccountLinkId
        ? links.find(
              (link) =>
                  link.plaidAccountLinkId === account.plaidAccountLinkId &&
                  (link.status === "linked" || link.status === "error"),
          )
        : undefined;

    return (
        bySummaryId ??
        links
            .filter(
                (link) =>
                    link.accountId === account.accountId &&
                    (link.status === "linked" || link.status === "error"),
            )
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    );
}
