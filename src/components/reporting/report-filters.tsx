"use client";

import { startTransition, useMemo, useState } from "react";

import { ComboboxSelect } from "@/components/shared/combobox-select";
import { controlClassNames } from "@/lib/theme/theme-recipes";

type ReportFiltersProps = {
    accounts: Array<{
        accountId: string;
        name: string;
    }>;
    initialAccountId?: string;
    initialEndDate: string;
    initialStartDate: string;
};

export function ReportFilters({
    accounts,
    initialAccountId,
    initialEndDate,
    initialStartDate,
}: ReportFiltersProps) {
    const [startDate, setStartDate] = useState(initialStartDate);
    const [endDate, setEndDate] = useState(initialEndDate);
    const [accountId, setAccountId] = useState(initialAccountId ?? "");
    const accountOptions = useMemo(
        () =>
            accounts.map((account) => ({
                label: account.name,
                value: account.accountId,
            })),
        [accounts],
    );

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const params = new URLSearchParams({
            startDate,
            endDate,
        });

        if (accountId) {
            params.set("accountId", accountId);
        }

        startTransition(() => {
            window.history.pushState(null, "", `/reporting?${params.toString()}`);
        });
    }

    function handleReset() {
        setStartDate(initialStartDate);
        setEndDate(initialEndDate);
        setAccountId("");

        startTransition(() => {
            window.history.pushState(
                null,
                "",
                `/reporting?${new URLSearchParams({
                    startDate: initialStartDate,
                    endDate: initialEndDate,
                }).toString()}`,
            );
        });
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="grid gap-4 lg:grid-cols-[1fr_1fr_1.25fr_auto]"
        >
            <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                Start date
                <input
                    required
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className={controlClassNames.field}
                />
            </label>

            <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                End date
                <input
                    required
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className={controlClassNames.field}
                />
            </label>

            <ComboboxSelect
                emptyOption={{
                    label: "All accounts",
                    value: "",
                }}
                label="Account filter"
                noResultsLabel="No accounts found"
                onChange={setAccountId}
                options={accountOptions}
                value={accountId}
            />

            <div className="flex flex-wrap items-end gap-3 lg:justify-end">
                <button
                    type="button"
                    onClick={handleReset}
                    className={controlClassNames.secondaryAction}
                >
                    Reset
                </button>
                <button
                    type="submit"
                    className={controlClassNames.primaryAction}
                >
                    Apply filters
                </button>
            </div>
        </form>
    );
}
