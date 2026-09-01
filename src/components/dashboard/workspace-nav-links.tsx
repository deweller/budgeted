"use client";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
    faBook,
    faChartLine,
    faHouse,
    faGear,
    faListCheck,
    faReceipt,
    faTableCells,
    faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { WorkspaceSection } from "@/lib/navigation/workspace-sections";
import { getWorkspaceNavLinkClassName } from "@/lib/theme/theme-recipes";

type WorkspaceNavLinksProps = {
    ariaLabel: string;
    collapsed?: boolean;
    layout: "inline" | "stacked";
    sections: WorkspaceSection[];
};

const sectionIcons: Record<WorkspaceSection["sectionId"], IconDefinition> = {
    accounts: faWallet,
    budget: faTableCells,
    dashboard: faHouse,
    globalBudget: faListCheck,
    ledgers: faBook,
    reporting: faChartLine,
    transactions: faReceipt,
    utilities: faGear,
};

export function WorkspaceNavLinks({
    ariaLabel,
    collapsed = false,
    layout,
    sections,
}: WorkspaceNavLinksProps) {
    const pathname = usePathname();
    const navClassName =
        layout === "stacked"
            ? "mt-6 grid gap-2"
            : "flex gap-2 overflow-x-auto pb-1";
    const linkClassName = layout === "stacked" ? "stacked" : "inline";

    return (
        <nav aria-label={ariaLabel} className={navClassName}>
            {sections.map((item) => {
                const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                const linkLayout =
                    layout === "stacked" && collapsed
                        ? "stackedCompact"
                        : linkClassName;
                const icon = sectionIcons[item.sectionId];

                return (
                    <Link
                        aria-current={isActive ? "page" : undefined}
                        key={item.href}
                        href={item.href}
                        className={getWorkspaceNavLinkClassName(
                            linkLayout,
                            isActive,
                        )}
                        title={collapsed ? item.label : undefined}
                    >
                        {layout === "stacked" ? (
                            <FontAwesomeIcon
                                aria-hidden="true"
                                className="size-4 shrink-0"
                                icon={icon}
                            />
                        ) : null}
                        <span className={collapsed ? "sr-only" : undefined}>
                            {item.label}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
