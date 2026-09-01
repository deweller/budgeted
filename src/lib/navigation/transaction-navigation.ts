import type { MouseEvent } from "react";

import {
    getTransactionsAccountHref,
    type TransactionAccountRouteAccount,
} from "@/lib/navigation/transaction-account-routes";
import {
    toTransactionReference,
    type TransactionReference,
} from "@/features/transactions/models/transaction-reference";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

type TransactionNavigationRouter = {
    push: (href: string) => void;
};

function shouldHandleTransactionLinkClick(
    event: MouseEvent<HTMLAnchorElement>,
) {
    return (
        !event.defaultPrevented &&
        event.button === 0 &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (!event.currentTarget.target || event.currentTarget.target === "_self")
    );
}

export function getTransactionFallbackHref(transactionId: string) {
    return `${getTransactionsAccountHref(null, [])}?selected=${encodeURIComponent(
        transactionId,
    )}`;
}

export function resolveTransactionHref(
    snapshot: WorkspaceSnapshot,
    transactionId: string,
) {
    const transaction = snapshot.transactions.find(
        (candidate) => candidate.transactionId === transactionId,
    );

    return resolveTransactionReferenceHref({
        accounts: snapshot.accounts,
        reference: transaction ? toTransactionReference(transaction) : null,
        transactionId,
    });
}

export function resolveTransactionReferenceHref(input: {
    accounts: TransactionAccountRouteAccount[];
    reference: TransactionReference | null;
    transactionId: string;
}) {
    const accountId = input.reference?.accountIds.find((candidateAccountId) =>
        input.accounts.some(
            (account) => account.accountId === candidateAccountId,
        ),
    );
    const account = accountId
        ? input.accounts.find(
              (candidate) => candidate.accountId === accountId,
          )
        : undefined;

    return `${getTransactionsAccountHref(account ?? null, input.accounts)}?selected=${encodeURIComponent(
        input.transactionId,
    )}`;
}

type NavigateToTransactionInput = {
    loadTransactionReference: (
        transactionId: string,
    ) => Promise<TransactionReference | null>;
    router: TransactionNavigationRouter;
    snapshot: WorkspaceSnapshot;
    transactionId: string;
};

export async function navigateToTransaction(input: NavigateToTransactionInput) {
    const snapshotTransaction = input.snapshot.transactions.find(
        (transaction) => transaction.transactionId === input.transactionId,
    );
    const reference = snapshotTransaction
        ? toTransactionReference(snapshotTransaction)
        : await input.loadTransactionReference(input.transactionId);

    input.router.push(
        resolveTransactionReferenceHref({
            accounts: input.snapshot.accounts,
            reference,
            transactionId: input.transactionId,
        }),
    );
}

export async function navigateToTransactionOnClick(
    input: NavigateToTransactionInput & {
        event: MouseEvent<HTMLAnchorElement>;
    },
) {
    if (!shouldHandleTransactionLinkClick(input.event)) {
        return;
    }

    input.event.preventDefault();
    await navigateToTransaction(input);
}
