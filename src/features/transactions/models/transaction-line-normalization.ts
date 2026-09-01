import { normalizeOptionalString } from "@/lib/strings";

import { isSystemReferenceCategoryId } from "./reference-category";
import {
    isOneSidedAccountTransactionLine,
    type TransactionShapeLine,
} from "./transaction-shape";

export type TransactionCategoryShapeLine = TransactionShapeLine & {
    categoryId?: string | null;
};

export const NO_TRANSACTION_LINE_CATEGORY_ID = "__no_category__";
export const NO_TRANSACTION_LINE_FROM_ACCOUNT_ID = "__no_from_account__";
export const NO_TRANSACTION_LINE_TO_ACCOUNT_ID = "__no_to_account__";

const hiddenAccountIds = new Set([
    NO_TRANSACTION_LINE_FROM_ACCOUNT_ID,
    NO_TRANSACTION_LINE_TO_ACCOUNT_ID,
]);

export function toStoredTransactionLineCategoryId(
    value: string | undefined | null,
) {
    return normalizeOptionalString(value) ?? NO_TRANSACTION_LINE_CATEGORY_ID;
}

export function toStoredTransactionLineFromAccountId(
    value: string | undefined | null,
) {
    return normalizeOptionalString(value) ?? NO_TRANSACTION_LINE_FROM_ACCOUNT_ID;
}

export function toStoredTransactionLineToAccountId(
    value: string | undefined | null,
) {
    return normalizeOptionalString(value) ?? NO_TRANSACTION_LINE_TO_ACCOUNT_ID;
}

export function toPublicTransactionLineCategoryId(
    value: string | undefined | null,
) {
    const normalized = normalizeOptionalString(value);

    return normalized === NO_TRANSACTION_LINE_CATEGORY_ID
        ? undefined
        : normalized;
}

export function toPublicTransactionLineFromAccountId(
    value: string | undefined | null,
) {
    const normalized = normalizeOptionalString(value);

    return normalized === NO_TRANSACTION_LINE_FROM_ACCOUNT_ID
        ? undefined
        : normalized;
}

export function toPublicTransactionLineToAccountId(
    value: string | undefined | null,
) {
    const normalized = normalizeOptionalString(value);

    return normalized === NO_TRANSACTION_LINE_TO_ACCOUNT_ID
        ? undefined
        : normalized;
}

export function toEditableTransactionLineCategoryId(
    value: string | undefined | null,
) {
    const publicCategoryId = toPublicTransactionLineCategoryId(value);

    return publicCategoryId && !isSystemReferenceCategoryId(publicCategoryId)
        ? publicCategoryId
        : "";
}

export function toDisplayTransactionLineCategoryId(
    value: string | undefined | null,
) {
    const publicCategoryId = toPublicTransactionLineCategoryId(value);

    return publicCategoryId && !isSystemReferenceCategoryId(publicCategoryId)
        ? publicCategoryId
        : undefined;
}

export function toEditableTransactionLineAccountId(
    value: string | undefined | null,
) {
    const normalized = normalizeOptionalString(value);

    return normalized && !hiddenAccountIds.has(normalized) ? normalized : "";
}

export function isUncategorizedAccountMovementLine(
    line: TransactionCategoryShapeLine,
) {
    return (
        isOneSidedAccountTransactionLine(line) &&
        !toDisplayTransactionLineCategoryId(line.categoryId)
    );
}

export function transactionHasUncategorizedActivity(input: {
    kind: "adjustment" | "standard";
    lines: readonly TransactionCategoryShapeLine[];
}) {
    return (
        input.kind === "standard" &&
        input.lines.some(isUncategorizedAccountMovementLine)
    );
}
