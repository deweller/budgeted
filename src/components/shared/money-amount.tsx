import { formatUsd } from "@/lib/formatting/money";
import { getMoneyToneClassName } from "@/lib/theme/theme-recipes";

type MoneyAmountProps = {
    cents: number;
    className?: string;
};

export function MoneyAmount({ cents, className }: MoneyAmountProps) {
    return (
        <span
            className={[getMoneyToneClassName(cents), className]
                .filter(Boolean)
                .join(" ")}
        >
            {formatUsd(cents)}
        </span>
    );
}
