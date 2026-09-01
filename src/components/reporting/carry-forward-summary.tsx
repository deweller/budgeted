import type { AttentionState } from "@/modules/budgeting";

import { MoneyAmount } from "@/components/shared/money-amount";
import { typographyClassNames } from "@/lib/theme/theme-recipes";

type CarryForwardDetail = {
    categoryId: string;
    categoryName: string;
    carryForwardCents: number;
    periodId: string;
    reducedByOverspending: boolean;
};

type CarryForwardSummaryProps = {
    attentionStates: AttentionState[];
    details: CarryForwardDetail[];
};

export function CarryForwardSummary({
    attentionStates,
    details,
}: CarryForwardSummaryProps) {
    if (attentionStates.length === 0 && details.length === 0) {
        return null;
    }

    return (
        <section className="grid gap-4">
            <div>
                <p className={typographyClassNames.eyebrow}>
                    Carry-forward and attention
                </p>
                <p className={`mt-2 text-sm ${typographyClassNames.mutedBody}`}>
                    Overspending rollovers and uncategorized activity stay
                    visible after refresh, navigation, and later sign-in.
                </p>
            </div>

            {attentionStates.length > 0 ? (
                <ul className="grid gap-2 border border-[var(--tone-warning-border)] bg-[var(--tone-warning-surface)] p-4 text-sm leading-6 text-[var(--tone-warning-ink)]">
                    {attentionStates.map((state, index) => (
                        <li
                            key={`${state.code}-${state.categoryId ?? "global"}-${index}`}
                        >
                            {state.message}
                        </li>
                    ))}
                </ul>
            ) : null}

            {details.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                                <th className="px-4 py-3 font-medium">
                                    Period
                                </th>
                                <th className="px-4 py-3 font-medium">
                                    Category
                                </th>
                                <th className="px-4 py-3 text-right font-medium">
                                    Carry-forward
                                </th>
                                <th className="px-4 py-3 font-medium">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {details.map((detail) => (
                                <tr
                                    key={`${detail.periodId}-${detail.categoryId}`}
                                    className="border-b border-[var(--color-border)]/70 last:border-b-0"
                                >
                                    <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                                        {detail.periodId}
                                    </td>
                                    <td className="px-4 py-3">
                                        {detail.categoryName}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <MoneyAmount
                                            cents={detail.carryForwardCents}
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        {detail.reducedByOverspending ? (
                                            <span className="border border-[var(--tone-warning-border)] bg-[var(--tone-warning-surface)] px-2 py-1 text-xs font-medium text-[var(--tone-warning-ink)]">
                                                Reduced by overspending
                                            </span>
                                        ) : (
                                            <span className="text-[var(--color-muted)]">
                                                Carried forward
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </section>
    );
}
