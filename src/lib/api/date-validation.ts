const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string) {
    if (!isoDatePattern.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidDateTime(value: string) {
    return !Number.isNaN(new Date(value).getTime());
}

export function parseDateTimeToIso(value: string, message: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error(message);
    }

    return date.toISOString();
}
