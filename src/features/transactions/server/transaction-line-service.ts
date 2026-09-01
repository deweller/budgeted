import { ulid } from "ulid";

import type { TransactionLineInput } from "@/features/transactions/models/transaction-form";
import {
    toPublicTransactionLineCategoryId,
    toPublicTransactionLineFromAccountId,
    toPublicTransactionLineToAccountId,
    toStoredTransactionLineCategoryId,
    toStoredTransactionLineFromAccountId,
    toStoredTransactionLineToAccountId,
} from "@/features/transactions/models/transaction-line-normalization";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { normalizeOptionalString } from "@/lib/strings";

export type PersistedTransactionLine = {
    amountCents: number;
    categoryId?: string;
    createdAt: string;
    fromAccountId?: string;
    lineId: string;
    memo?: string;
    payee?: string;
    sortOrder: number;
    toAccountId?: string;
    transactionId: string;
    updatedAt: string;
    ledgerId: string;
};

export function toPublicTransactionLineRecord(
    line: PersistedTransactionLine,
): PersistedTransactionLine {
    return {
        ...line,
        categoryId: toPublicTransactionLineCategoryId(line.categoryId),
        fromAccountId: toPublicTransactionLineFromAccountId(line.fromAccountId),
        toAccountId: toPublicTransactionLineToAccountId(line.toAccountId),
    };
}

export function toStoredTransactionLineRecord(
    line: PersistedTransactionLine,
): PersistedTransactionLine {
    return {
        ...line,
        categoryId: toStoredTransactionLineCategoryId(line.categoryId),
        fromAccountId: toStoredTransactionLineFromAccountId(line.fromAccountId),
        toAccountId: toStoredTransactionLineToAccountId(line.toAccountId),
    };
}

function toRecord(input: {
    existing?: PersistedTransactionLine;
    line: TransactionLineInput;
    now: string;
    transactionId: string;
    ledgerId: string;
}) {
    if (!Number.isInteger(input.line.amountCents) || input.line.amountCents <= 0) {
        throw new HttpError(
            422,
            "line_validation_error",
            "Transaction line amounts must be positive cents values.",
        );
    }

    return {
        lineId: input.existing?.lineId ?? input.line.lineId ?? ulid(),
        transactionId: input.transactionId,
        ledgerId: input.ledgerId,
        amountCents: input.line.amountCents,
        fromAccountId: toStoredTransactionLineFromAccountId(
            input.line.fromAccountId,
        ),
        toAccountId: toStoredTransactionLineToAccountId(
            input.line.toAccountId,
        ),
        categoryId: toStoredTransactionLineCategoryId(input.line.categoryId),
        payee: normalizeOptionalString(input.line.payee),
        memo: normalizeOptionalString(input.line.memo),
        sortOrder: input.line.sortOrder ?? 0,
        createdAt: input.existing?.createdAt ?? input.now,
        updatedAt: input.now,
    } satisfies PersistedTransactionLine;
}

export function createTransactionLineRecords(input: {
    existing?: PersistedTransactionLine[];
    lines: TransactionLineInput[];
    now?: string;
    transactionId: string;
    ledgerId: string;
}) {
    const existingById = new Map(
        (input.existing ?? []).map((line) => [line.lineId, line]),
    );
    const now = input.now ?? new Date().toISOString();

    return input.lines.map((line, index) =>
        toRecord({
            existing: line.lineId ? existingById.get(line.lineId) : undefined,
            now,
            line: {
                ...line,
                sortOrder: line.sortOrder ?? index,
            },
            transactionId: input.transactionId,
            ledgerId: input.ledgerId,
        }),
    );
}

export function toTransactionLineInputs(
    lines: PersistedTransactionLine[],
): TransactionLineInput[] {
    return lines.map((line) => {
        const publicLine = toPublicTransactionLineRecord(line);

        return {
            amountCents: publicLine.amountCents,
            categoryId: publicLine.categoryId,
            fromAccountId: publicLine.fromAccountId,
            lineId: publicLine.lineId,
            memo: publicLine.memo,
            payee: publicLine.payee,
            sortOrder: publicLine.sortOrder,
            toAccountId: publicLine.toAccountId,
        };
    });
}

export async function listTransactionLinesForTransaction(
    ledgerId: string,
    transactionId: string,
) {
    const { entities } = getBudgetedSchema();
    const lines = await queryAllPages(
        entities.transactionLines.query
            .byLine({ ledgerId })
            .begins({ transactionId }),
        { consistent: true },
    );

    return (lines as PersistedTransactionLine[])
        .map(toPublicTransactionLineRecord)
        .sort((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
                return left.sortOrder - right.sortOrder;
            }

            return left.lineId.localeCompare(right.lineId);
        });
}

export async function listTransactionLinesForCategory(
    ledgerId: string,
    categoryId: string,
) {
    const { entities } = getBudgetedSchema();
    const lines = await queryAllPages(
        entities.transactionLines.query.byCategory({ ledgerId, categoryId }),
    );

    return (lines as PersistedTransactionLine[])
        .map(toPublicTransactionLineRecord)
        .sort((left, right) => {
            if (left.transactionId !== right.transactionId) {
                return left.transactionId.localeCompare(right.transactionId);
            }

            return left.lineId.localeCompare(right.lineId);
        });
}

export async function replaceTransactionLines(input: {
    lines: TransactionLineInput[];
    transactionId: string;
    ledgerId: string;
}) {
    const { entities } = getBudgetedSchema();
    const existing = await listTransactionLinesForTransaction(
        input.ledgerId,
        input.transactionId,
    );
    const records = createTransactionLineRecords({
        ...input,
        existing,
    });
    const nextIds = new Set(records.map((line) => line.lineId));

    await Promise.all([
        ...existing
            .filter((line) => !nextIds.has(line.lineId))
            .map((line) =>
                entities.transactionLines
                    .delete({
                        ledgerId: input.ledgerId,
                        transactionId: line.transactionId,
                        lineId: line.lineId,
                    })
                    .go(),
            ),
        ...records.map((record) =>
            entities.transactionLines.put(record).go(),
        ),
    ]);

    return records.map(toPublicTransactionLineRecord);
}

export async function removeTransactionLines(
    ledgerId: string,
    transactionId: string,
) {
    const { entities } = getBudgetedSchema();
    const existing = await listTransactionLinesForTransaction(
        ledgerId,
        transactionId,
    );

    await Promise.all(
        existing.map((line) =>
            entities.transactionLines
                .delete({
                    ledgerId,
                    transactionId: line.transactionId,
                    lineId: line.lineId,
                })
                .go(),
        ),
    );

    return existing;
}
