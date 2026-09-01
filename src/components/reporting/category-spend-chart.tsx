import { MoneyAmount } from "@/components/shared/money-amount";
import { typographyClassNames } from "@/lib/theme/theme-recipes";
import type { CategoryReportTotal } from "@/modules/reporting";

type CategorySpendChartProps = {
    totals: CategoryReportTotal[];
};

export function CategorySpendChart({ totals }: CategorySpendChartProps) {
    if (totals.length === 0) {
        return (
            <section>
                <p className={typographyClassNames.eyebrow}>
                    Category spending
                </p>
                <p className={`mt-3 text-sm ${typographyClassNames.mutedBody}`}>
                    No categorized spending matched the selected filters.
                </p>
            </section>
        );
    }

    const maxSpent = Math.max(
        ...totals.map((total) => Math.abs(total.spentCents)),
    );

    return (
        <section>
            <p className={typographyClassNames.eyebrow}>Category spending</p>
            <div className="mt-4 grid gap-4">
                {totals.map((total) => (
                    <div key={total.categoryId} className="grid gap-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-[var(--color-ink)]">
                                    {total.name}
                                </span>
                                {total.reducedByOverspending ? (
                                    <span className="border border-[var(--tone-warning-border)] bg-[var(--tone-warning-surface)] px-2 py-1 text-xs font-medium text-[var(--tone-warning-ink)]">
                                        Reduced carry-forward
                                    </span>
                                ) : null}
                            </div>
                            <span className="font-medium">
                                <MoneyAmount cents={total.spentCents} />
                            </span>
                        </div>
                        <div className="h-3 border border-[var(--color-border)] bg-[var(--color-panel-strong)]">
                            <div
                                className="h-full bg-[var(--color-accent-ink)]"
                                style={{
                                    width: `${Math.max(
                                        8,
                                        Math.round(
                                            (Math.abs(total.spentCents) /
                                                maxSpent) *
                                                100,
                                        ),
                                    )}%`,
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
