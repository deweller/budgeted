"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, type ReactNode } from "react";
import { faCaretLeft, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { typographyClassNames } from "@/lib/theme/theme-recipes";
import {
    formatMonthlyPeriodLabel,
    getNextMonthlyPeriodId,
    getPreviousMonthlyPeriodId,
} from "@/modules/ledger/monthly-period";

type PeriodSelectorProps = {
    actions?: ReactNode;
    onPeriodChange?: (periodId: string) => void;
    periodId: string;
};

const periodArrowButtonClassName =
    "inline-flex size-9 cursor-pointer items-center justify-center border border-[var(--color-border)] bg-[var(--color-panel-strong)] text-base font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]";

export function PeriodSelector({
    actions,
    onPeriodChange,
    periodId,
}: PeriodSelectorProps) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const activePeriodLabel = formatMonthlyPeriodLabel(periodId);

    function navigateToMonth(targetPeriodId: string) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("month", targetPeriodId);

        startTransition(() => {
            if (onPeriodChange) {
                onPeriodChange(targetPeriodId);
                window.history.pushState(
                    null,
                    "",
                    `${pathname}?${params.toString()}`,
                );
                return;
            }

            router.push(`${pathname}?${params.toString()}`);
        });
    }

    return (
        <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-end">
            <div className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                <span className={typographyClassNames.eyebrow}>
                    Active period
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label="Go to previous month"
                        onClick={() =>
                            navigateToMonth(
                                getPreviousMonthlyPeriodId(periodId),
                            )
                        }
                        className={periodArrowButtonClassName}
                    >
                        <FontAwesomeIcon
                            aria-hidden="true"
                            className="text-lg"
                            icon={faCaretLeft}
                        />
                    </button>
                    <p className="min-w-40 text-center text-xl font-semibold tracking-tight text-[var(--color-ink)]">
                        {activePeriodLabel}
                    </p>
                    <button
                        type="button"
                        aria-label="Go to next month"
                        onClick={() =>
                            navigateToMonth(getNextMonthlyPeriodId(periodId))
                        }
                        className={periodArrowButtonClassName}
                    >
                        <FontAwesomeIcon
                            aria-hidden="true"
                            className="text-lg"
                            icon={faCaretRight}
                        />
                    </button>
                </div>
            </div>

            {actions ? (
                <div className="lg:justify-self-end">{actions}</div>
            ) : null}
        </div>
    );
}
