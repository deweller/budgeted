import { formatUsd, tryParseUsdToCents } from "@/lib/formatting/money";
import { getMoneyToneClassName } from "@/lib/theme/theme-recipes";

function formatTransactionAmount(cents: number) {
    if (cents >= 0) {
        return formatUsd(cents);
    }

    return formatUsd(Math.abs(cents)).replace("$", "$-");
}

export function TransactionAmountDirection({ value }: { value: string }) {
    const cents = tryParseUsdToCents(value);

    if (cents === null || cents === 0) {
        return null;
    }

    const isCharge = cents < 0;

    return (
        <span
            className={`mt-1 block text-xs font-medium ${getMoneyToneClassName(cents)}`}
        >
            {isCharge ? "Debit" : "Credit"}: {formatTransactionAmount(cents)}
        </span>
    );
}
