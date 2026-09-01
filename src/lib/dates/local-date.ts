function padDatePart(value: number) {
    return String(value).padStart(2, "0");
}

function parseDate(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

const shortDisplayDateFormatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
});
const mediumDisplayDateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});
const mediumDisplayDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

export function formatLocalDate(value: Date | string) {
    const date = parseDate(value);

    if (!date) {
        return "";
    }

    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function formatLocalDateTime(value: Date | string) {
    const date = parseDate(value);

    if (!date) {
        return "";
    }

    return [
        formatLocalDate(date),
        `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`,
    ].join("T");
}

export function isDateInLocalDateRange(
    value: Date | string,
    startDate?: string,
    endDate?: string,
) {
    const dateKey = formatLocalDate(value);

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

export function formatShortDisplayDate(value: Date | string) {
    const date = parseDate(value);

    return date ? shortDisplayDateFormatter.format(date) : "";
}

export function formatMediumDisplayDate(value: Date | string) {
    const date = parseDate(value);

    return date ? mediumDisplayDateFormatter.format(date) : "";
}

export function formatMediumDisplayDateTime(value: Date | string) {
    const date = parseDate(value);

    return date ? mediumDisplayDateTimeFormatter.format(date) : "";
}
