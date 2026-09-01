import type { ReactNode } from "react";

import { MoneyAmount } from "@/components/shared/money-amount";
import {
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import type {
    AccountHealthSnapshot,
    PeriodComparison,
} from "@/modules/reporting";

type NetWorthSummaryProps = {
    accountHealth: AccountHealthSnapshot;
    inflowCents: number;
    netWorthCents: number;
    outflowCents: number;
    periodComparisons: PeriodComparison[];
};

function MetricCard({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className={`p-4 ${surfaceClassNames.panelStrong}`}>
            <p className={typographyClassNames.eyebrow}>{label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">
                {value}
            </p>
        </div>
    );
}

export function NetWorthSummary({
    accountHealth,
    inflowCents,
    netWorthCents,
    outflowCents,
    periodComparisons,
}: NetWorthSummaryProps) {
    return (
        <section className="grid gap-4">
            <div>
                <p className={typographyClassNames.eyebrow}>
                    Net worth and flow
                </p>
                <p className={`mt-2 text-sm ${typographyClassNames.mutedBody}`}>
                    Current net position is reconciled from the latest saved
                    account balances.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                    label="Net worth"
                    value={<MoneyAmount cents={netWorthCents} />}
                />
                <MetricCard
                    label="Inflows"
                    value={<MoneyAmount cents={inflowCents} />}
                />
                <MetricCard
                    label="Outflows"
                    value={<MoneyAmount cents={outflowCents} />}
                />
                <MetricCard
                    label="Assets"
                    value={
                        <MoneyAmount cents={accountHealth.assetBalanceCents} />
                    }
                />
                <MetricCard
                    label="Liabilities"
                    value={
                        <MoneyAmount
                            cents={-accountHealth.liabilityBalanceCents}
                        />
                    }
                />
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                            <th className="px-4 py-3 font-medium">Period</th>
                            <th className="px-4 py-3 text-right font-medium">
                                Inflows
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                                Outflows
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                                Net change
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {periodComparisons.map((comparison) => (
                            <tr
                                key={comparison.periodId}
                                className="border-b border-[var(--color-border)]/70 last:border-b-0"
                            >
                                <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                                    {comparison.periodId}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <MoneyAmount
                                        cents={comparison.inflowCents}
                                    />
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <MoneyAmount
                                        cents={comparison.outflowCents}
                                    />
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <MoneyAmount
                                        cents={comparison.netChangeCents}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
