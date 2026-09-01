import Link from "next/link";

export type BreadcrumbItem = {
    href?: string;
    label: string;
};

type BreadcrumbsProps = {
    items: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;

                    return (
                        <li
                            key={`${item.label}-${index}`}
                            className="flex items-center gap-2"
                        >
                            {index > 0 ? (
                                <span aria-hidden="true">/</span>
                            ) : null}
                            {item.href && !isLast ? (
                                <Link
                                    href={item.href}
                                    className="cursor-pointer text-[var(--color-accent-contrast)] transition hover:text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                >
                                    {item.label}
                                </Link>
                            ) : (
                                <span
                                    aria-current={isLast ? "page" : undefined}
                                    className="text-[var(--color-ink)]"
                                >
                                    {item.label}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
