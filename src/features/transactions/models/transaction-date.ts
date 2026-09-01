const transactionDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const transactionDateTimePattern = /^\d{4}-\d{2}-\d{2}T.+/;

function padDatePart(value: number) {
    return String(value).padStart(2, "0");
}

function formatUtcDateKey(date: Date) {
    return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
}

function isValidDateKey(value: string) {
    if (!transactionDatePattern.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) && formatUtcDateKey(date) === value;
}

export function toTransactionDateInputValue(value?: Date | string | null) {
    if (!value) {
        return "";
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? "" : formatUtcDateKey(value);
    }

    if (transactionDatePattern.test(value)) {
        return isValidDateKey(value) ? value : "";
    }

    if (
        !transactionDateTimePattern.test(value) ||
        !isValidDateKey(value.slice(0, 10))
    ) {
        return "";
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? "" : formatUtcDateKey(date);
}

export function toTransactionOccurredAt(value: Date | string) {
    const dateKey = toTransactionDateInputValue(value);

    if (!dateKey) {
        throw new Error("Transaction date is required.");
    }

    return `${dateKey}T00:00:00.000Z`;
}

export function isValidTransactionDate(value: string) {
    return toTransactionDateInputValue(value) !== "";
}

export function isTransactionDateInRange(
    value: Date | string,
    startDate?: string,
    endDate?: string,
) {
    const dateKey = toTransactionDateInputValue(value);

    if (!dateKey) {
        return false;
    }

    if (startDate && dateKey < startDate) {
        return false;
    }

    if (endDate && dateKey > endDate) {
        return false;
    }

    return true;
}

export function formatTransactionDisplayDate(value: Date | string) {
    const dateKey = toTransactionDateInputValue(value);

    if (!dateKey) {
        return "";
    }

    const [year, month, day] = dateKey.split("-");

    return `${month}/${day}/${year}`;
}
