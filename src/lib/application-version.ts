import { GENERATED_APPLICATION_VERSION } from "@/lib/application-version.generated";

export const APPLICATION_VERSION = GENERATED_APPLICATION_VERSION;

export function isApplicationVersionTimestamp(
    value: unknown,
): value is string {
    if (typeof value !== "string" || value.length === 0) {
        return false;
    }

    const timestamp = new Date(value);

    return (
        Number.isFinite(timestamp.getTime()) &&
        timestamp.toISOString() === value
    );
}

export function formatApplicationVersionForDisplay(version: string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(version));
}
