import {
    transactionHasAccountActivity,
    getFinancialPostingDeltaForLedgerAccount,
} from "@/modules/ledger";
import type { AccountType } from "@/modules/accounts/account-types";
import type { TransactionImportActivityRecord } from "@/features/transaction-importers/models/transaction-importer-contract";

import {
    toDisplayTransactionLineCategoryId,
    transactionHasUncategorizedActivity,
} from "./transaction-line-normalization";
import { getTransactionMergeEligibility } from "./transaction-merge-eligibility";
import { getTransactionLineSignedAmountCents } from "./transaction-shape";

const matchingWindowDays = 7;
const dayMilliseconds = 24 * 60 * 60 * 1_000;

export type TransactionAutoMatchAccount = {
    accountId: string;
    accountType: AccountType;
    ledgerAccountId: string;
    name: string;
};

export type TransactionAutoMatchTransaction = {
    displayAmountCents: number;
    kind: "adjustment" | "standard";
    lines: Array<{
        amountCents?: number;
        categoryId?: string | null;
        fromAccountId?: string | null;
        toAccountId?: string | null;
    }>;
    importActivities?: readonly TransactionImportActivityRecord[];
    memo?: string;
    occurredAt: string;
    payee?: string;
    postings: Array<{
        amountCents: number;
        direction: "credit" | "debit";
        ledgerAccountId: string;
        ledgerAccountKind: "category" | "equity" | "financial";
    }>;
    referenceAccountId: string;
    source?: "manual" | "plaid" | "venmo";
    status: "entered" | "cleared" | "reconciled" | "voided";
    transactionId: string;
    updatedAt?: string;
};

export type TransactionAutoMatchRejection = {
    accountId: string;
    leftTransactionId: string;
    matchDecisionId: string;
    matchFingerprint: string;
    rightTransactionId: string;
};

export type TransactionAutoMatchType =
    | "bankTransfer"
    | "creditCardPayment"
    | "duplicate";

type CrossAccountTransfer = {
    amountCents: number;
    destinationAccount: TransactionAutoMatchAccount;
    requiresTransferSynthesis: boolean;
    sourceAccount: TransactionAutoMatchAccount;
};

type TransactionAutoMatchPairBase = {
    account: TransactionAutoMatchAccount;
    dayDistance: number;
    left: TransactionAutoMatchTransaction;
    right: TransactionAutoMatchTransaction;
    sourcePriority: number;
};

export type TransactionAutoMatchPair =
    | (TransactionAutoMatchPairBase & {
          matchType: "bankTransfer";
          transfer: CrossAccountTransfer;
      })
    | (TransactionAutoMatchPairBase & {
          matchType: "creditCardPayment";
          transfer: CrossAccountTransfer;
      })
    | (TransactionAutoMatchPairBase & {
          matchType: "duplicate";
          transfer?: never;
      });

export type TransactionAutoMatchResult = {
    ambiguousPairs: TransactionAutoMatchPair[];
    rejectedPairs: Array<{
        pair: TransactionAutoMatchPair;
        rejection: TransactionAutoMatchRejection;
    }>;
    readyPairs: TransactionAutoMatchPair[];
};

function getUtcDayTimestamp(value: string) {
    return Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function getDayDistance(left: string, right: string) {
    const leftDay = getUtcDayTimestamp(left);
    const rightDay = getUtcDayTimestamp(right);

    if (!Number.isFinite(leftDay) || !Number.isFinite(rightDay)) {
        return null;
    }

    return Math.abs(leftDay - rightDay) / dayMilliseconds;
}

function getSourcePriority(
    left: TransactionAutoMatchTransaction,
    right: TransactionAutoMatchTransaction,
) {
    return (left.source ?? "manual") !== (right.source ?? "manual") ? 0 : 1;
}

function areBothPlaidTransactions(
    left: TransactionAutoMatchTransaction,
    right: TransactionAutoMatchTransaction,
) {
    return left.source === "plaid" && right.source === "plaid";
}

function getTransactionAmountForAccount(
    transaction: TransactionAutoMatchTransaction,
    account: TransactionAutoMatchAccount,
) {
    if (transaction.referenceAccountId === account.accountId) {
        return transaction.displayAmountCents;
    }

    const postingAmount = getFinancialPostingDeltaForLedgerAccount({
        ledgerAccountId: account.ledgerAccountId,
        postings: transaction.postings,
    });

    if (postingAmount !== null) {
        return postingAmount;
    }

    const lines = transaction.lines.filter(
        (line) =>
            typeof line.amountCents === "number" &&
            (line.fromAccountId === account.accountId ||
                line.toAccountId === account.accountId),
    );

    return lines.length > 0
        ? lines.reduce(
              (total, line) =>
                  total +
                  getTransactionLineSignedAmountCents(
                      {
                          ...line,
                          amountCents: line.amountCents!,
                      },
                      account.accountId,
                  ),
              0,
          )
        : null;
}

function getMatchTypePriority(pair: TransactionAutoMatchPair) {
    switch (pair.matchType) {
        case "creditCardPayment":
            return 0;
        case "bankTransfer":
            return 1;
        case "duplicate":
            return 2;
    }
}

function comparePairs(
    left: TransactionAutoMatchPair,
    right: TransactionAutoMatchPair,
) {
    return (
        getMatchTypePriority(left) - getMatchTypePriority(right) ||
        left.sourcePriority - right.sourcePriority ||
        left.dayDistance - right.dayDistance ||
        left.left.occurredAt.localeCompare(right.left.occurredAt) ||
        left.right.occurredAt.localeCompare(right.right.occurredAt) ||
        left.left.transactionId.localeCompare(right.left.transactionId) ||
        left.right.transactionId.localeCompare(right.right.transactionId)
    );
}

export function createTransactionAutoMatchDecisionId(
    leftTransactionId: string,
    rightTransactionId: string,
) {
    return [leftTransactionId, rightTransactionId].sort().join(":");
}

export function createTransactionAutoMatchFingerprint(
    pair: TransactionAutoMatchPair,
) {
    const transactions = [pair.left, pair.right]
        .map((transaction) => ({
            displayAmountCents: transaction.displayAmountCents,
            occurredAt: transaction.occurredAt,
            source: transaction.source ?? "manual",
            transactionId: transaction.transactionId,
            updatedAt: transaction.updatedAt ?? "",
        }))
        .sort((left, right) =>
            left.transactionId.localeCompare(right.transactionId),
        );

    return pair.matchType === "creditCardPayment"
        ? JSON.stringify({
              bankAccountId: pair.transfer.sourceAccount.accountId,
              creditCardAccountId: pair.transfer.destinationAccount.accountId,
              transactions,
              version: 2,
          })
        : pair.matchType === "bankTransfer"
          ? JSON.stringify({
                destinationAccountId: pair.transfer.destinationAccount.accountId,
                sourceAccountId: pair.transfer.sourceAccount.accountId,
                transactions,
                version: 3,
            })
        : JSON.stringify({
              accountId: pair.account.accountId,
              transactions,
              version: 1,
          });
}

function isManualPlaidPair(
    left: TransactionAutoMatchTransaction,
    right: TransactionAutoMatchTransaction,
) {
    return (left.source ?? "manual") !== (right.source ?? "manual");
}

function createEligibleDuplicatePair(input: {
    account: TransactionAutoMatchAccount;
    left: TransactionAutoMatchTransaction;
    right: TransactionAutoMatchTransaction;
}) {
    if (
        areBothPlaidTransactions(input.left, input.right) ||
        (!isManualPlaidPair(input.left, input.right) &&
            !transactionHasUncategorizedActivity(input.left) &&
            !transactionHasUncategorizedActivity(input.right)) ||
        !getTransactionMergeEligibility([input.left, input.right]).canMerge
    ) {
        return null;
    }

    const dayDistance = getDayDistance(
        input.left.occurredAt,
        input.right.occurredAt,
    );

    if (dayDistance === null || dayDistance > matchingWindowDays) {
        return null;
    }

    const leftAmount = getTransactionAmountForAccount(
        input.left,
        input.account,
    );
    const rightAmount = getTransactionAmountForAccount(
        input.right,
        input.account,
    );

    if (leftAmount === null || leftAmount !== rightAmount) {
        return null;
    }

    return {
        account: input.account,
        dayDistance,
        left: input.left,
        matchType: "duplicate",
        right: input.right,
        sourcePriority: getSourcePriority(input.left, input.right),
    } satisfies TransactionAutoMatchPair;
}

function isBankTransferAccount(account: TransactionAutoMatchAccount) {
    return account.accountType === "checking" || account.accountType === "savings";
}

function isCrossAccountTransferDestination(
    account: TransactionAutoMatchAccount,
) {
    return (
        account.accountType === "creditCard" || isBankTransferAccount(account)
    );
}

function transactionHasNoAssignedCategory(
    transaction: TransactionAutoMatchTransaction,
) {
    return (
        transaction.kind === "standard" &&
        transaction.lines.length > 0 &&
        transaction.lines.every(
            (line) => !toDisplayTransactionLineCategoryId(line.categoryId),
        )
    );
}

type CrossAccountTransferShape =
    | {
          amountCents: number;
          kind: "source";
          sourceAccount: TransactionAutoMatchAccount;
      }
    | {
          amountCents: number;
          destinationAccount: TransactionAutoMatchAccount;
          kind: "destination";
      }
    | {
          amountCents: number;
          destinationAccount: TransactionAutoMatchAccount;
          kind: "transfer";
          sourceAccount: TransactionAutoMatchAccount;
      };

function getCrossAccountTransferShape(input: {
    accounts: TransactionAutoMatchAccount[];
    transaction: TransactionAutoMatchTransaction;
}): CrossAccountTransferShape | null {
    if (!transactionHasNoAssignedCategory(input.transaction)) {
        return null;
    }

    const movements = input.accounts
        .map((account) => ({
            account,
            amountCents: getTransactionAmountForAccount(
                input.transaction,
                account,
            ),
        }))
        .filter(
            (
                movement,
            ): movement is {
                account: TransactionAutoMatchAccount;
                amountCents: number;
            } => movement.amountCents !== null && movement.amountCents !== 0,
        );

    if (movements.length === 1) {
        const [movement] = movements;

        if (!movement) {
            return null;
        }

        if (isBankTransferAccount(movement.account) && movement.amountCents < 0) {
            return {
                amountCents: Math.abs(movement.amountCents),
                kind: "source",
                sourceAccount: movement.account,
            };
        }

        if (isCrossAccountTransferDestination(movement.account) && movement.amountCents > 0) {
            return {
                amountCents: movement.amountCents,
                destinationAccount: movement.account,
                kind: "destination",
            };
        }

        return null;
    }

    if (movements.length !== 2) {
        return null;
    }

    const sourceMovement = movements.find(
        ({ account, amountCents }) =>
            isBankTransferAccount(account) && amountCents < 0,
    );
    const destinationMovement = movements.find(
        ({ account, amountCents }) =>
            isCrossAccountTransferDestination(account) && amountCents > 0,
    );

    if (
        !sourceMovement ||
        !destinationMovement ||
        sourceMovement.account.accountId === destinationMovement.account.accountId ||
        Math.abs(sourceMovement.amountCents) !== destinationMovement.amountCents
    ) {
        return null;
    }

    return {
        amountCents: destinationMovement.amountCents,
        destinationAccount: destinationMovement.account,
        kind: "transfer",
        sourceAccount: sourceMovement.account,
    };
}

export function getCrossAccountTransferMatch(input: {
    accounts: TransactionAutoMatchAccount[];
    left: TransactionAutoMatchTransaction;
    right: TransactionAutoMatchTransaction;
}) {
    if (!getTransactionMergeEligibility([input.left, input.right]).canMerge) {
        return null;
    }

    const leftShape = getCrossAccountTransferShape({
        accounts: input.accounts,
        transaction: input.left,
    });
    const rightShape = getCrossAccountTransferShape({
        accounts: input.accounts,
        transaction: input.right,
    });

    if (!leftShape || !rightShape || leftShape.amountCents !== rightShape.amountCents) {
        return null;
    }

    const sidePair =
        leftShape.kind === "source" && rightShape.kind === "destination"
            ? {
                  destinationAccount: rightShape.destinationAccount,
                  sourceAccount: leftShape.sourceAccount,
              }
            : rightShape.kind === "source" &&
                leftShape.kind === "destination"
              ? {
                    destinationAccount: leftShape.destinationAccount,
                    sourceAccount: rightShape.sourceAccount,
                }
              : null;

    if (sidePair && sidePair.sourceAccount.accountId !== sidePair.destinationAccount.accountId) {
        return {
            amountCents: leftShape.amountCents,
            ...sidePair,
            matchType:
                sidePair.destinationAccount.accountType === "creditCard"
                    ? ("creditCardPayment" as const)
                    : ("bankTransfer" as const),
            requiresTransferSynthesis: true,
        };
    }

    const transfer =
        leftShape.kind === "transfer"
            ? leftShape
            : rightShape.kind === "transfer"
              ? rightShape
              : null;
    const side = transfer === leftShape ? rightShape : leftShape;

    if (!transfer || side.kind === "transfer") {
        return null;
    }

    const matchesExistingSide =
        (side.kind === "source" &&
            side.sourceAccount.accountId === transfer.sourceAccount.accountId) ||
        (side.kind === "destination" &&
            side.destinationAccount.accountId ===
                transfer.destinationAccount.accountId);

    return matchesExistingSide
        ? {
              amountCents: transfer.amountCents,
              destinationAccount: transfer.destinationAccount,
              matchType:
                  transfer.destinationAccount.accountType === "creditCard"
                      ? ("creditCardPayment" as const)
                      : ("bankTransfer" as const),
              requiresTransferSynthesis: false,
              sourceAccount: transfer.sourceAccount,
          }
        : null;
}

function createEligibleCrossAccountTransferPair(input: {
    accounts: TransactionAutoMatchAccount[];
    left: TransactionAutoMatchTransaction;
    right: TransactionAutoMatchTransaction;
}) {
    const transfer = getCrossAccountTransferMatch(input);

    if (!transfer) {
        return null;
    }

    const dayDistance = getDayDistance(
        input.left.occurredAt,
        input.right.occurredAt,
    );

    if (dayDistance === null || dayDistance > matchingWindowDays) {
        return null;
    }

    return {
        account: transfer.sourceAccount,
        dayDistance,
        left: input.left,
        matchType: transfer.matchType,
        right: input.right,
        sourcePriority: getSourcePriority(input.left, input.right),
        transfer,
    } satisfies TransactionAutoMatchPair;
}

function pairIncludesAccount(pair: TransactionAutoMatchPair, accountId?: string) {
    if (!accountId) {
        return true;
    }

    return pair.matchType !== "duplicate"
        ? pair.transfer.sourceAccount.accountId === accountId ||
              pair.transfer.destinationAccount.accountId === accountId
        : pair.account.accountId === accountId;
}

export function findTransactionAutoMatches(input: {
    accounts: TransactionAutoMatchAccount[];
    accountId?: string;
    rejections?: TransactionAutoMatchRejection[];
    transactions: TransactionAutoMatchTransaction[];
}): TransactionAutoMatchResult {
    const pairByKey = new Map<string, TransactionAutoMatchPair>();

    function addPair(pair: TransactionAutoMatchPair | null) {
        if (!pair) {
            return;
        }

        const pairKey = createTransactionAutoMatchDecisionId(
            pair.left.transactionId,
            pair.right.transactionId,
        );
        const existing = pairByKey.get(pairKey);

        if (!existing || comparePairs(pair, existing) < 0) {
            pairByKey.set(pairKey, pair);
        }
    }

    for (const account of input.accounts) {
        const scopedTransactions = input.transactions.filter((transaction) =>
            transactionHasAccountActivity(transaction, account),
        );

        for (let leftIndex = 0; leftIndex < scopedTransactions.length; leftIndex += 1) {
            const left = scopedTransactions[leftIndex];

            if (!left) {
                continue;
            }

            for (
                let rightIndex = leftIndex + 1;
                rightIndex < scopedTransactions.length;
                rightIndex += 1
            ) {
                const right = scopedTransactions[rightIndex];

                if (!right) {
                    continue;
                }

                addPair(
                    createEligibleDuplicatePair({ account, left, right }),
                );
            }
        }
    }

    const paymentShapes = input.transactions.map((transaction) => ({
        shape: getCrossAccountTransferShape({
            accounts: input.accounts,
            transaction,
        }),
        transaction,
    }));
    const paymentCandidatesByAmount = new Map<
        number,
        typeof paymentShapes
    >();

    for (const candidate of paymentShapes) {
        if (!candidate.shape) {
            continue;
        }

        const candidates =
            paymentCandidatesByAmount.get(candidate.shape.amountCents) ?? [];
        candidates.push(candidate);
        paymentCandidatesByAmount.set(candidate.shape.amountCents, candidates);
    }

    for (const candidates of paymentCandidatesByAmount.values()) {
        for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
            const left = candidates[leftIndex]?.transaction;

            if (!left) {
                continue;
            }

            for (
                let rightIndex = leftIndex + 1;
                rightIndex < candidates.length;
                rightIndex += 1
            ) {
                const right = candidates[rightIndex]?.transaction;

                if (right) {
                    addPair(
                        createEligibleCrossAccountTransferPair({
                            accounts: input.accounts,
                            left,
                            right,
                        }),
                    );
                }
            }
        }
    }

    const rejectionsByDecisionId = new Map(
        (input.rejections ?? []).map((rejection) => [
            rejection.matchDecisionId,
            rejection,
        ]),
    );
    const rejectedPairs: TransactionAutoMatchResult["rejectedPairs"] = [];
    const pairs = [...pairByKey.values()]
        .sort(comparePairs)
        .filter((pair) => pairIncludesAccount(pair, input.accountId))
        .filter((pair) => {
            const rejection = rejectionsByDecisionId.get(
                createTransactionAutoMatchDecisionId(
                    pair.left.transactionId,
                    pair.right.transactionId,
                ),
            );

            if (
                !rejection ||
                rejection.accountId !== pair.account.accountId ||
                rejection.matchFingerprint !==
                    createTransactionAutoMatchFingerprint(pair)
            ) {
                return true;
            }

            rejectedPairs.push({ pair, rejection });
            return false;
        });
    const candidateCountByTransactionId = new Map<string, number>();

    for (const pair of pairs) {
        for (const transactionId of [
            pair.left.transactionId,
            pair.right.transactionId,
        ]) {
            candidateCountByTransactionId.set(
                transactionId,
                (candidateCountByTransactionId.get(transactionId) ?? 0) + 1,
            );
        }
    }

    return {
        ambiguousPairs: pairs.filter(
            (pair) =>
                (candidateCountByTransactionId.get(pair.left.transactionId) ?? 0) >
                    1 ||
                (candidateCountByTransactionId.get(pair.right.transactionId) ?? 0) >
                    1,
        ),
        rejectedPairs,
        readyPairs: pairs.filter(
            (pair) =>
                (candidateCountByTransactionId.get(pair.left.transactionId) ?? 0) ===
                    1 &&
                (candidateCountByTransactionId.get(pair.right.transactionId) ?? 0) ===
                    1,
        ),
    };
}
