export type TransactionShapeLine = {
    fromAccountId?: string | null;
    toAccountId?: string | null;
} & Record<string, unknown>;

export type TransactionAmountLine = TransactionShapeLine & {
    amountCents: number;
};

export type TransferCounterpartyDirection = "from" | "to";

export type TransferCounterparty = {
    counterpartyAccountId: string;
    direction: TransferCounterpartyDirection;
    sourceAccountId: string;
    targetAccountId: string;
};

export type TransactionLineShape = {
    lines: readonly unknown[];
};

export type TransactionAmountShape = TransactionLineShape & {
    displayAmountCents: number;
};

export function hasMultipleTransactionLines(transaction: TransactionLineShape) {
    return transaction.lines.length > 1;
}

export function hasTransactionLineAccount(line: TransactionShapeLine) {
    return Boolean(line.fromAccountId || line.toAccountId);
}

export function isOneSidedAccountTransactionLine(
    line: TransactionShapeLine,
) {
    return Boolean(line.fromAccountId) !== Boolean(line.toAccountId);
}

export function isTransferTransactionLine<TLine extends TransactionShapeLine>(
    line: TLine,
): line is TLine & { fromAccountId: string; toAccountId: string } {
    return Boolean(line.fromAccountId && line.toAccountId);
}

export function findTransferTransactionLine<TLine extends TransactionShapeLine>(
    transaction: { lines: readonly TLine[] },
) {
    return transaction.lines.find(isTransferTransactionLine);
}

export function hasTransferTransactionLine(transaction: {
    lines: readonly TransactionShapeLine[];
}) {
    return Boolean(findTransferTransactionLine(transaction));
}

export function isSingleTransferLineTransaction(
    transaction: { lines: readonly TransactionShapeLine[] },
) {
    const [line] = transaction.lines;

    return (
        transaction.lines.length === 1 &&
        Boolean(line && isTransferTransactionLine(line))
    );
}

export function getTransferLineCounterparty<
    TLine extends TransactionShapeLine,
>(line: TLine, perspectiveAccountId?: string | null) {
    if (!isTransferTransactionLine(line)) {
        return null;
    }

    const isPerspectiveTarget =
        Boolean(perspectiveAccountId) &&
        line.toAccountId === perspectiveAccountId;

    return {
        counterpartyAccountId: isPerspectiveTarget
            ? line.fromAccountId
            : line.toAccountId,
        direction: isPerspectiveTarget ? "from" : "to",
        sourceAccountId: line.fromAccountId,
        targetAccountId: line.toAccountId,
    } satisfies TransferCounterparty;
}

export function getTransactionTransferCounterparty<
    TLine extends TransactionShapeLine,
>(
    transaction: { lines: readonly TLine[] },
    perspectiveAccountId?: string | null,
) {
    const transferLine = findTransferTransactionLine(transaction);

    return transferLine
        ? getTransferLineCounterparty(transferLine, perspectiveAccountId)
        : null;
}

export function isZeroNetMultiLineTransaction(
    transaction: TransactionAmountShape,
) {
    return (
        transaction.displayAmountCents === 0 &&
        hasMultipleTransactionLines(transaction)
    );
}

export function getTransactionLineSignedAmountCents(
    line: TransactionAmountLine,
    perspectiveAccountId: string,
) {
    if (line.toAccountId === perspectiveAccountId) {
        return line.amountCents;
    }

    if (line.fromAccountId === perspectiveAccountId) {
        return -line.amountCents;
    }

    if (line.toAccountId && !line.fromAccountId) {
        return line.amountCents;
    }

    if (line.fromAccountId && !line.toAccountId) {
        return -line.amountCents;
    }

    return line.amountCents;
}
