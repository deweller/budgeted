export function normalizeOptionalString(value: string | null | undefined) {
    const trimmed = value?.trim();

    return trimmed ? trimmed : undefined;
}
