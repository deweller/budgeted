const longMemoCharacterThreshold = 80;

export function isLongTransactionMemo(value: string) {
    return (
        value.includes("\n") ||
        value.trim().length > longMemoCharacterThreshold
    );
}

export function getTransactionMemoInputRows(value: string) {
    return isLongTransactionMemo(value) ? 2 : 1;
}
