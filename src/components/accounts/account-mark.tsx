"use client";

import {
    faBuildingColumns,
    faChartLine,
    faCreditCard,
    faLayerGroup,
    faPiggyBank,
    faRightLeft,
    faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";

type AccountMarkProps = {
    account?: Pick<
        AccountWithBalance,
        | "accountType"
        | "name"
        | "plaidInstitutionLogo"
        | "plaidInstitutionName"
    >;
    className?: string;
};

function getPlaidLogoSource(logo: string | undefined) {
    if (!logo) {
        return undefined;
    }

    return logo.startsWith("data:")
        ? logo
        : `data:image/png;base64,${logo}`;
}

function getAccountTypeIcon(type: AccountWithBalance["accountType"]) {
    if (type === "checking") {
        return faBuildingColumns;
    }

    if (type === "savings") {
        return faPiggyBank;
    }

    if (type === "creditCard") {
        return faCreditCard;
    }

    if (type === "transfers") {
        return faRightLeft;
    }

    if (type === "tracking") {
        return faChartLine;
    }

    return faWallet;
}

export function AccountMark({
    account,
    className = "size-8",
}: AccountMarkProps) {
    const plaidLogoSource = getPlaidLogoSource(account?.plaidInstitutionLogo);

    if (plaidLogoSource && account) {
        return (
            <span
                role="img"
                aria-label={`${account.plaidInstitutionName ?? account.name} logo`}
                className={`${className} shrink-0 bg-[length:contain] bg-center bg-no-repeat`}
                style={{ backgroundImage: `url(${plaidLogoSource})` }}
            />
        );
    }

    return (
        <span
            className={`${className} flex shrink-0 items-center justify-center bg-[var(--color-panel-strong)] text-[var(--color-accent-contrast)]`}
        >
            <FontAwesomeIcon
                aria-hidden="true"
                icon={
                    account
                        ? getAccountTypeIcon(account.accountType)
                        : faLayerGroup
                }
            />
        </span>
    );
}
