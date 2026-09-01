"use client";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
    faCalculator,
    faCircleQuestion,
    faMoneyBillWave,
    faRightLeft,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { MoneyAmount } from "@/components/shared/money-amount";
import { TransactionMemoDisplay } from "@/components/transactions/transaction-memo-display";
import { useTransactionReferenceLoader } from "@/components/transactions/use-transaction-reference-loader";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import { formatTransactionDisplayDate } from "@/features/transactions/models/transaction-date";
import {
    getTransactionFallbackHref,
    navigateToTransactionOnClick,
} from "@/lib/navigation/transaction-navigation";
import { tableClassNames } from "@/lib/theme/theme-recipes";
import type { CategoryDetailReportEvent } from "@/lib/workspace/category-detail-report-projector";

type CategoryActivityReportTableProps = {
    emptyMessage: string;
    events: CategoryDetailReportEvent[];
};

function getEventTypeMeta(event: CategoryDetailReportEvent): {
    icon: IconDefinition;
    label: string;
} {
    if (event.type === "allocation") {
        return {
            icon: faRightLeft,
            label: "Allocation",
        };
    }

    if (event.type === "transaction") {
        return {
            icon: faMoneyBillWave,
            label: "Transaction",
        };
    }

    if (event.type === "projection") {
        return {
            icon: faCalculator,
            label: event.payee || "Info",
        };
    }

    return {
        icon: faCircleQuestion,
        label: event.type,
    };
}

function getTransactionHref(event: CategoryDetailReportEvent) {
    if (event.type !== "transaction" || !event.transactionId) {
        return null;
    }

    return getTransactionFallbackHref(event.transactionId);
}

export function CategoryActivityReportTable({
    emptyMessage,
    events,
}: CategoryActivityReportTableProps) {
    const router = useRouter();
    const { snapshot } = useWorkspaceStore();
    const { loadTransactionReference } = useTransactionReferenceLoader();

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
                <thead className={tableClassNames.stickyHeader}>
                    <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                        <th className="px-3 py-3 font-medium">Date</th>
                        <th className="px-3 py-3 font-medium">Type</th>
                        <th className="px-3 py-3 font-medium">Payee</th>
                        <th className="px-3 py-3 font-medium">Memo</th>
                        <th className="px-3 py-3 text-right font-medium">
                            Amount
                        </th>
                        <th className="px-3 py-3 text-right font-medium">
                            Running total
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {events.length > 0 ? (
                        events.map((event) => {
                            const typeMeta = getEventTypeMeta(event);
                            const isProjection = event.type === "projection";
                            const transactionHref = getTransactionHref(event);
                            const typeContent = (
                                <span className="inline-flex items-center gap-2">
                                    <FontAwesomeIcon
                                        aria-hidden="true"
                                        fixedWidth
                                        icon={typeMeta.icon}
                                        className={
                                            isProjection
                                                ? "text-[var(--tone-info-ink)]"
                                                : "text-[var(--color-accent-contrast)]"
                                        }
                                    />
                                    <span
                                        className={
                                            transactionHref
                                                ? "font-medium text-[var(--color-accent-contrast)] group-hover:underline"
                                                : undefined
                                        }
                                    >
                                        {typeMeta.label}
                                    </span>
                                </span>
                            );
                            const displayedPayee = isProjection
                                ? ""
                                : event.payee;

                            return (
                                <tr
                                    key={event.eventId}
                                    className={`border-b border-[var(--color-border)]/70 ${
                                        isProjection
                                            ? "bg-[var(--tone-info-surface-strong)]/60"
                                            : ""
                                    }`}
                                >
                                    <td className="whitespace-nowrap px-3 py-2 text-[var(--color-ink)]">
                                        {formatTransactionDisplayDate(event.date)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-[var(--color-muted)]">
                                        {transactionHref ? (
                                            <Link
                                                href={transactionHref}
                                                onClick={(clickEvent) => {
                                                    if (
                                                        event.transactionId
                                                    ) {
                                                        void navigateToTransactionOnClick(
                                                            {
                                                                event: clickEvent,
                                                                loadTransactionReference,
                                                                router,
                                                                snapshot,
                                                                transactionId:
                                                                    event.transactionId,
                                                            },
                                                        );
                                                    }
                                                }}
                                                className="group inline-flex cursor-pointer transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                                            >
                                                {typeContent}
                                            </Link>
                                        ) : (
                                            typeContent
                                        )}
                                    </td>
                                    <td
                                        className={`px-3 py-2 text-[var(--color-ink)] ${
                                            isProjection ? "font-medium" : ""
                                        }`}
                                    >
                                        {isProjection
                                            ? null
                                            : displayedPayee || "-"}
                                    </td>
                                    <td className="px-3 py-2 text-[var(--color-muted)]">
                                        {isProjection ? null : (
                                            <TransactionMemoDisplay
                                                managedMetadata={event}
                                                memo={event.memo}
                                            />
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right">
                                        {event.hideAmount ? null : (
                                            <MoneyAmount cents={event.amountCents} />
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                                        <MoneyAmount cents={event.runningCents} />
                                    </td>
                                </tr>
                            );
                        })
                    ) : (
                        <tr>
                            <td
                                colSpan={6}
                                className="px-3 py-8 text-center text-sm text-[var(--color-muted)]"
                            >
                                {emptyMessage}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
