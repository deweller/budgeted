"use client";

import {
    toEditableTransactionLineAccountId,
    toEditableTransactionLineCategoryId,
} from "@/features/transactions/models/transaction-line-normalization";
import {
    type ResolvedTransactionTemplateLine,
    resolveTransactionTemplateLines,
} from "@/features/transaction-templates/models/formula";
import { parseTransactionTemplateLines } from "@/features/transaction-templates/models/transaction-template";
import {
    getTransactionLineSignedAmountCents,
    hasMultipleTransactionLines,
} from "@/features/transactions/models/transaction-shape";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import { parseUsdToCents } from "@/lib/formatting/money";
import type { WorkspaceTransactionTemplateRecord } from "@/lib/workspace/sync-types";

export type TransactionLineDraft = {
    amount: string;
    categoryId: string;
    fromAccountId: string;
    id: string;
    memo: string;
    payee: string;
    toAccountId: string;
};

export type NormalizedTransactionLineDraft = {
    amountCents: number;
    categoryId?: string;
    fromAccountId?: string;
    lineId?: string;
    memo: string;
    payee: string;
    sortOrder: number;
    toAccountId?: string;
};

export const uncategorizedAssignmentValue = "__line_uncategorized__";
export const transactionTemplateAssignmentPrefix = "template:";

export function toUsdInput(cents: number) {
    return (cents / 100).toFixed(2);
}

export function createEmptyLineDraft(index: number): TransactionLineDraft {
    return {
        amount: "",
        categoryId: "",
        fromAccountId: "",
        id: `new-${index}-${Date.now()}`,
        memo: "",
        payee: "",
        toAccountId: "",
    };
}

export function getDefaultLineDrafts(
    transaction: TransactionWithPostings | undefined,
    perspectiveAccountId = transaction?.referenceAccountId ?? "",
): TransactionLineDraft[] {
    if (transaction?.lines.length) {
        const useTransactionSummaryFallback = transaction.lines.length === 1;

        return transaction.lines.map((line) => ({
            amount: toUsdInput(
                getTransactionLineSignedAmountCents(
                    line,
                    perspectiveAccountId,
                ),
            ),
            categoryId: toEditableTransactionLineCategoryId(line.categoryId),
            fromAccountId: toEditableTransactionLineAccountId(
                line.fromAccountId,
            ),
            id: line.lineId,
            memo:
                line.memo ??
                (useTransactionSummaryFallback ? (transaction.memo ?? "") : ""),
            payee:
                line.payee ??
                (useTransactionSummaryFallback ? (transaction.payee ?? "") : ""),
            toAccountId: toEditableTransactionLineAccountId(line.toAccountId),
        }));
    }

    return [createEmptyLineDraft(0)];
}

export function getDefaultSplitMode(
    transaction: TransactionWithPostings | undefined,
) {
    return Boolean(transaction && hasMultipleTransactionLines(transaction));
}

export function ensureSplitLineDrafts(lines: TransactionLineDraft[]) {
    if (lines.length >= 2) {
        return lines;
    }

    if (lines.length === 1) {
        return [lines[0], createEmptyLineDraft(1)];
    }

    return [createEmptyLineDraft(0), createEmptyLineDraft(1)];
}

export function parseSignedAmount(value: string) {
    try {
        return parseUsdToCents(value || "0");
    } catch {
        return 0;
    }
}

function shouldSignedAmountControlStandardLineDirection(input: {
    line: TransactionLineDraft;
    selectedAccountId: string;
    transactionKind: TransactionWithPostings["kind"];
}) {
    return (
        input.transactionKind === "standard" &&
        Boolean(input.selectedAccountId) &&
        !(input.line.fromAccountId && input.line.toAccountId)
    );
}

export function getEstimatedTransactionNetCents(input: {
    lines: TransactionLineDraft[];
    selectedAccountId: string;
    transactionKind: TransactionWithPostings["kind"];
}) {
    return input.lines.reduce((total, line) => {
        const signedAmountCents = parseSignedAmount(line.amount);
        const amountCents = Math.abs(signedAmountCents);

        if (
            shouldSignedAmountControlStandardLineDirection({
                line,
                selectedAccountId: input.selectedAccountId,
                transactionKind: input.transactionKind,
            })
        ) {
            return total + signedAmountCents;
        }

        if (line.toAccountId === input.selectedAccountId) {
            return total + amountCents;
        }

        if (line.fromAccountId === input.selectedAccountId) {
            return total - amountCents;
        }

        if (!line.fromAccountId && !line.toAccountId) {
            return total + signedAmountCents;
        }

        if (line.toAccountId && !line.fromAccountId) {
            return total + amountCents;
        }

        if (line.fromAccountId && !line.toAccountId) {
            return total - amountCents;
        }

        return total;
    }, 0);
}

export function buildCategoryAssignmentValue(categoryId: string) {
    return `category:${categoryId}`;
}

export function buildTransactionTemplateAssignmentValue(templateId: string) {
    return `${transactionTemplateAssignmentPrefix}${templateId}`;
}

export function getTransactionTemplateIdFromAssignmentValue(value: string) {
    return value.startsWith(transactionTemplateAssignmentPrefix)
        ? value.slice(transactionTemplateAssignmentPrefix.length)
        : null;
}

export function buildToAccountAssignmentValue(accountId: string) {
    return `to:${accountId}`;
}

export function buildFromAccountAssignmentValue(accountId: string) {
    return `from:${accountId}`;
}

const adjustmentAssignmentPrefix = "adjustment:";

export function buildAdjustmentAssignmentValue(value: string) {
    return `${adjustmentAssignmentPrefix}${value}`;
}

export function getAdjustmentAssignmentValue(value: string) {
    return value.startsWith(adjustmentAssignmentPrefix)
        ? value.slice(adjustmentAssignmentPrefix.length)
        : null;
}

export function getLineAssignmentValue(input: {
    line: TransactionLineDraft;
    selectedAccountId: string;
    transactionKind: TransactionWithPostings["kind"];
}) {
    const { line, selectedAccountId, transactionKind } = input;

    if (transactionKind === "standard" && line.categoryId) {
        return buildCategoryAssignmentValue(line.categoryId);
    }

    if (line.fromAccountId && line.toAccountId) {
        if (line.fromAccountId === selectedAccountId) {
            return buildToAccountAssignmentValue(line.toAccountId);
        }

        if (line.toAccountId === selectedAccountId) {
            return buildFromAccountAssignmentValue(line.fromAccountId);
        }

        return buildToAccountAssignmentValue(line.toAccountId);
    }

    if (transactionKind === "adjustment") {
        if (line.toAccountId) {
            return buildToAccountAssignmentValue(line.toAccountId);
        }

        if (line.fromAccountId) {
            return buildFromAccountAssignmentValue(line.fromAccountId);
        }
    }

    return transactionKind === "standard" ? uncategorizedAssignmentValue : "";
}

export function createLineAssignmentPatch(input: {
    selectedAccountId: string;
    transactionKind: TransactionWithPostings["kind"];
    value: string;
}): Partial<TransactionLineDraft> {
    const { selectedAccountId, transactionKind, value } = input;

    if (value === uncategorizedAssignmentValue) {
        return {
            categoryId: "",
            fromAccountId: "",
            toAccountId: "",
        };
    }

    if (value.startsWith("category:")) {
        return {
            categoryId: value.slice("category:".length),
            fromAccountId: "",
            toAccountId: "",
        };
    }

    if (value.startsWith("to:")) {
        const accountId = value.slice("to:".length);

        return {
            categoryId: "",
            fromAccountId:
                transactionKind === "adjustment" || accountId === selectedAccountId
                    ? ""
                    : selectedAccountId,
            toAccountId: accountId,
        };
    }

    if (value.startsWith("from:")) {
        const accountId = value.slice("from:".length);

        return {
            categoryId: "",
            fromAccountId: accountId,
            toAccountId:
                transactionKind === "adjustment" || accountId === selectedAccountId
                    ? ""
                    : selectedAccountId,
        };
    }

    return {};
}

export function normalizeTransactionLineDrafts(input: {
    lines: TransactionLineDraft[];
    selectedAccountId: string;
    transactionKind: TransactionWithPostings["kind"];
}) {
    const { lines, selectedAccountId, transactionKind } = input;

    return lines.map((line, index): NormalizedTransactionLineDraft => {
        const signedAmountCents = parseSignedAmount(line.amount);
        const amountCents = Math.abs(signedAmountCents);
        let fromAccountId = line.fromAccountId || undefined;
        let toAccountId = line.toAccountId || undefined;
        const categoryId =
            transactionKind === "standard" && line.categoryId
                ? line.categoryId
                : undefined;

        if (amountCents === 0) {
            throw new Error("Transaction line amounts cannot be zero.");
        }

        if (
            shouldSignedAmountControlStandardLineDirection({
                line,
                selectedAccountId,
                transactionKind,
            })
        ) {
            if (signedAmountCents < 0) {
                fromAccountId = selectedAccountId;
                toAccountId = undefined;
            } else {
                toAccountId = selectedAccountId;
                fromAccountId = undefined;
            }
        }

        if (!fromAccountId && !toAccountId) {
            throw new Error(
                "Each transaction line needs a from account, a to account, or a primary account with a signed amount.",
            );
        }

        if (fromAccountId && toAccountId && fromAccountId === toAccountId) {
            throw new Error("Transfer lines require two different accounts.");
        }

        if (transactionKind === "adjustment") {
            if (categoryId || Boolean(fromAccountId) === Boolean(toAccountId)) {
                throw new Error(
                    "Adjustment lines require exactly one account and no category.",
                );
            }
        } else if (categoryId && fromAccountId && toAccountId) {
            throw new Error(
                "A transaction line cannot be both a transfer and category assignment.",
            );
        }

        return {
            amountCents,
            categoryId,
            fromAccountId,
            lineId: line.id.startsWith("new-") ? undefined : line.id,
            memo: line.memo,
            payee: line.payee,
            sortOrder: index,
            toAccountId,
        };
    });
}

export function createLineDraftsFromTransactionTemplate(input: {
    template: WorkspaceTransactionTemplateRecord;
    totalCents: number;
}) {
    return resolveTransactionTemplatePreview(input).map(
        (line, index): TransactionLineDraft => {
            return {
                amount: toUsdInput(line.amountCents),
                categoryId: line.categoryId,
                fromAccountId: "",
                id: `new-template-${input.template.templateId}-${line.lineId}-${index}`,
                memo: "",
                payee: "",
                toAccountId: "",
            };
        },
    );
}

export function resolveTransactionTemplatePreview(input: {
    template: WorkspaceTransactionTemplateRecord;
    totalCents: number;
}): ResolvedTransactionTemplateLine[] {
    return resolveTransactionTemplateLines({
        lines: parseTransactionTemplateLines(input.template),
        requireNonZero: true,
        totalCents: input.totalCents,
    });
}

export function getPrimaryAccountId(input: {
    normalizedLines: NormalizedTransactionLineDraft[];
    selectedAccountId: string;
}) {
    const { normalizedLines, selectedAccountId } = input;

    return (
        selectedAccountId ||
        normalizedLines.find((line) => line.fromAccountId)?.fromAccountId ||
        normalizedLines.find((line) => line.toAccountId)?.toAccountId
    );
}
