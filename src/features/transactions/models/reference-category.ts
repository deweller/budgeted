import { normalizeOptionalString } from "@/lib/strings";
import { UNCATEGORIZED_CATEGORY_ID } from "@/modules/budgeting/uncategorized";
import {
    hasTransferTransactionLine,
    isZeroNetMultiLineTransaction,
    type TransactionShapeLine,
} from "@/features/transactions/models/transaction-shape";

export const ADJUSTMENT_REFERENCE_CATEGORY_ID = "__adjustment__";
export const MIXED_REFERENCE_CATEGORY_ID = "__mixed__";
export const UNCATEGORIZED_REFERENCE_CATEGORY_ID = UNCATEGORIZED_CATEGORY_ID;
export const ZERO_NET_REFERENCE_CATEGORY_ID = "__zero_net__";

export const SYSTEM_REFERENCE_CATEGORY_IDS = new Set([
    ADJUSTMENT_REFERENCE_CATEGORY_ID,
    MIXED_REFERENCE_CATEGORY_ID,
    UNCATEGORIZED_REFERENCE_CATEGORY_ID,
    ZERO_NET_REFERENCE_CATEGORY_ID,
]);

export type ReferenceCategoryLine = {
    categoryId?: string | null;
} & TransactionShapeLine;

export function isSystemReferenceCategoryId(value: string | undefined | null) {
    return Boolean(value && SYSTEM_REFERENCE_CATEGORY_IDS.has(value));
}

export function toVisibleReferenceCategoryId(
    value: string | undefined | null,
) {
    return value && !isSystemReferenceCategoryId(value) ? value : undefined;
}

export function inferTransactionReferenceCategoryId(input: {
    displayAmountCents: number;
    kind: "adjustment" | "standard";
    lines: ReferenceCategoryLine[];
    referenceCategoryId?: string | null;
}) {
    const visibleReferenceCategoryId = toVisibleReferenceCategoryId(
        input.referenceCategoryId,
    );

    if (visibleReferenceCategoryId) {
        return visibleReferenceCategoryId;
    }

    if (input.kind === "adjustment") {
        return ADJUSTMENT_REFERENCE_CATEGORY_ID;
    }

    if (isZeroNetMultiLineTransaction(input)) {
        return ZERO_NET_REFERENCE_CATEGORY_ID;
    }

    const categoryIds = Array.from(
        new Set(
            input.lines
                .map((line) => normalizeOptionalString(line.categoryId))
                .filter((categoryId): categoryId is string =>
                    Boolean(categoryId),
                ),
        ),
    );
    const hasTransferLines = hasTransferTransactionLine(input);

    if (categoryIds.length === 1 && !hasTransferLines) {
        return categoryIds[0];
    }

    if (categoryIds.length > 0 || hasTransferLines) {
        return MIXED_REFERENCE_CATEGORY_ID;
    }

    return UNCATEGORIZED_REFERENCE_CATEGORY_ID;
}
