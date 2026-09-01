import { toVisibleReferenceCategoryId } from "@/features/transactions/models/reference-category";
import {
    toPublicTransactionLineCategoryId,
    toPublicTransactionLineFromAccountId,
    toPublicTransactionLineToAccountId,
} from "@/features/transactions/models/transaction-line-normalization";
import type { WorkspaceEntityType } from "@/lib/workspace/sync-types";

export function normalizeWorkspaceDigestRecord(
    entityType: WorkspaceEntityType,
    record: unknown,
) {
    if (!record || typeof record !== "object") {
        return record;
    }

    if (entityType === "transaction") {
        const transaction = { ...(record as Record<string, unknown>) };
        const referenceCategoryId = toVisibleReferenceCategoryId(
            typeof transaction.referenceCategoryId === "string"
                ? transaction.referenceCategoryId
                : undefined,
        );

        if (referenceCategoryId) {
            transaction.referenceCategoryId = referenceCategoryId;
        } else {
            delete transaction.referenceCategoryId;
        }

        return transaction;
    }

    if (entityType === "transactionLine") {
        const line = { ...(record as Record<string, unknown>) };
        const categoryId = toPublicTransactionLineCategoryId(
            typeof line.categoryId === "string" ? line.categoryId : undefined,
        );
        const fromAccountId = toPublicTransactionLineFromAccountId(
            typeof line.fromAccountId === "string"
                ? line.fromAccountId
                : undefined,
        );
        const toAccountId = toPublicTransactionLineToAccountId(
            typeof line.toAccountId === "string" ? line.toAccountId : undefined,
        );

        if (categoryId) line.categoryId = categoryId;
        else delete line.categoryId;
        if (fromAccountId) line.fromAccountId = fromAccountId;
        else delete line.fromAccountId;
        if (toAccountId) line.toAccountId = toAccountId;
        else delete line.toAccountId;

        return line;
    }

    return record;
}
