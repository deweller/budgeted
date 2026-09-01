export type MonthlyPeriod = {
    periodId: string;
    startsOn: string;
    endsOn: string;
};

const monthlyPeriodIdPattern = /^(\d{4})-(\d{2})$/;
const monthNameFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
});

function parseInputDate(input: Date | string) {
    const value = input instanceof Date ? input : new Date(input);

    if (Number.isNaN(value.getTime())) {
        throw new Error(
            "Invalid date supplied for monthly period calculation.",
        );
    }

    return value;
}

function pad(value: number) {
    return String(value).padStart(2, "0");
}

function formatDate(date: Date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function getMonthlyPeriodId(input: Date | string) {
    const value = parseInputDate(input);
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}`;
}

export function getMonthlyPeriodBounds(periodId: string): MonthlyPeriod {
    const match = monthlyPeriodIdPattern.exec(periodId);

    if (!match) {
        throw new Error(
            "Monthly period identifiers must be in YYYY-MM format.",
        );
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;

    if (monthIndex < 0 || monthIndex > 11) {
        throw new Error(
            "Monthly period identifiers must use a month between 01 and 12.",
        );
    }

    const startsOn = new Date(Date.UTC(year, monthIndex, 1));
    const endsOn = new Date(Date.UTC(year, monthIndex + 1, 0));

    return {
        periodId,
        startsOn: formatDate(startsOn),
        endsOn: formatDate(endsOn),
    };
}

export function shiftMonthlyPeriod(periodId: string, offset: number) {
    const bounds = getMonthlyPeriodBounds(periodId);
    const anchor = new Date(`${bounds.startsOn}T00:00:00.000Z`);
    anchor.setUTCMonth(anchor.getUTCMonth() + offset);
    return getMonthlyPeriodBounds(getMonthlyPeriodId(anchor));
}

export function getPreviousMonthlyPeriodId(periodId: string) {
    return shiftMonthlyPeriod(periodId, -1).periodId;
}

export function getNextMonthlyPeriodId(periodId: string) {
    return shiftMonthlyPeriod(periodId, 1).periodId;
}

export function isMonthlyPeriodId(value: string) {
    try {
        getMonthlyPeriodBounds(value);
        return true;
    } catch {
        return false;
    }
}

export function formatMonthlyPeriodLabel(periodId: string) {
    const bounds = getMonthlyPeriodBounds(periodId);
    const anchor = new Date(`${bounds.startsOn}T00:00:00.000Z`);

    return `${monthNameFormatter.format(anchor)}, ${anchor.getUTCFullYear()}`;
}

export function isDateInMonthlyPeriod(input: Date | string, periodId: string) {
    return getMonthlyPeriodId(input) === periodId;
}
