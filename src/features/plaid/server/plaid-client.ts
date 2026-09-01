import {
    Configuration,
    CountryCode,
    PlaidApi,
    PlaidEnvironments,
    Products,
} from "plaid";

import { HttpError } from "@/lib/api/errors";
import {
    resolvePlaidClientId,
    resolvePlaidEnv,
    resolvePlaidSecret,
} from "@/lib/env/server";

export type BudgetedPlaidClient = Pick<
    PlaidApi,
    | "accountsGet"
    | "accountsBalanceGet"
    | "institutionsGetById"
    | "itemPublicTokenExchange"
    | "linkTokenCreate"
    | "transactionsSync"
>;

export const plaidProducts = [Products.Transactions];
export const plaidCountryCodes = [CountryCode.Us];

function resolvePlaidBasePath(plaidEnv: string) {
    const basePath = PlaidEnvironments[plaidEnv];

    if (!basePath) {
        throw new HttpError(
            500,
            "plaid_config_invalid",
            "PLAID_ENV must be sandbox, development, or production.",
        );
    }

    return basePath;
}

export function getPlaidClient(): BudgetedPlaidClient {
    const clientId = resolvePlaidClientId();
    const secret = resolvePlaidSecret();

    if (!clientId || !secret) {
        throw new HttpError(
            500,
            "plaid_config_missing",
            "Plaid is not configured.",
        );
    }

    return new PlaidApi(
        new Configuration({
            basePath: resolvePlaidBasePath(resolvePlaidEnv()),
            baseOptions: {
                headers: {
                    "PLAID-CLIENT-ID": clientId,
                    "PLAID-SECRET": secret,
                },
            },
        }),
    );
}
