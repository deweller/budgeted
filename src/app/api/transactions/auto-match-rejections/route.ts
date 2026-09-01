import { z } from "zod";

import {
    findTransactionAutoMatches,
    createTransactionAutoMatchDecisionId,
} from "@/features/transactions/models/transaction-auto-match";
import {
    rejectTransactionAutoMatch,
    restoreTransactionAutoMatchRejection,
} from "@/features/transactions/server/transaction-auto-match-rejection-service";
import { listTransactionChildrenByTransactionId } from "@/features/transactions/server/transaction-child-service";
import { listStoredTransactionsByIds } from "@/features/transactions/server/transaction-query-service";
import { HttpError } from "@/lib/api/errors";
import {
    handleWorkspaceRoute,
    workspaceCommittedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";
import { getBudgetedSchema } from "@/lib/db/schema";
import { queryAllPages } from "@/lib/db/query-all-pages";

const rejectSchema = z.object({
    transactionIds: z
        .array(z.string().trim().min(1))
        .length(2, "Select exactly two transactions.")
        .refine((transactionIds) => transactionIds[0] !== transactionIds[1], {
            message: "Select two different transactions.",
        }),
    mutationId: z.string().trim().min(1),
});

const restoreSchema = z.object({
    matchDecisionId: z.string().trim().min(1),
    mutationId: z.string().trim().min(1),
});

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) =>
        {
            const payload = await parseJsonBody(request, rejectSchema);
            const { entities } = getBudgetedSchema();
            const accounts = await queryAllPages(
                entities.accounts.query.byAccount({ ledgerId: context.ledgerId }),
                { consistent: true },
            );
            const transactions = await listStoredTransactionsByIds(
                context.ledgerId,
                payload.transactionIds,
            );
            const { linesByTransactionId, postingsByTransactionId } =
                await listTransactionChildrenByTransactionId(
                    context.ledgerId,
                    transactions.map((transaction) => transaction.transactionId),
                );

            const matches = findTransactionAutoMatches({
                accounts: accounts.map((account) => ({
                    accountId: account.accountId,
                    accountType: account.accountType,
                    ledgerAccountId: account.ledgerAccountId,
                    name: account.name,
                })),
                transactions: transactions.map((transaction) => ({
                    ...transaction,
                    lines:
                        linesByTransactionId.get(transaction.transactionId) ?? [],
                    postings:
                        postingsByTransactionId.get(transaction.transactionId) ??
                        [],
                })),
            });
            const matchDecisionId = createTransactionAutoMatchDecisionId(
                payload.transactionIds[0]!,
                payload.transactionIds[1]!,
            );
            const pair = [...matches.readyPairs, ...matches.ambiguousPairs].find(
                (candidate) =>
                    createTransactionAutoMatchDecisionId(
                        candidate.left.transactionId,
                        candidate.right.transactionId,
                    ) === matchDecisionId,
            );

            if (!pair) {
                throw new HttpError(
                    422,
                    "transaction_auto_match_invalid",
                    "These transactions are no longer an eligible auto match.",
                );
            }

            return workspaceCommittedMutationJson(context, () =>
                rejectTransactionAutoMatch({
                    ledgerId: context.ledgerId,
                    mutationId: payload.mutationId,
                    pair,
                }),
            );
        },
    );
}

export async function DELETE(request: Request) {
    return handleWorkspaceRoute(async (context) =>
        workspaceCommittedMutationJson(context, async () =>
            restoreTransactionAutoMatchRejection({
                ledgerId: context.ledgerId,
                ...(await parseJsonBody(request, restoreSchema)),
            }),
        ),
    );
}
