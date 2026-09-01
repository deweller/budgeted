import { ulid } from "ulid";
import type { AccountBase, RemovedTransaction, Transaction } from "plaid";

import { getAccountRecord } from "@/features/accounts/server/account-service";
import type {
    PlaidExchangeRequest,
    PlaidSyncRequest,
} from "@/features/plaid/models/plaid-requests";
import {
    getPlaidClient,
    plaidCountryCodes,
    plaidProducts,
} from "@/features/plaid/server/plaid-client";
import { toTransactionOccurredAt } from "@/features/transactions/models/transaction-date";
import { listTransactionChildren } from "@/features/transactions/server/transaction-child-service";
import {
    upsertTransactionWithWorkspaceChanges,
    voidTransactionWithWorkspaceChanges,
} from "@/features/transactions/server/transaction-save-service";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { normalizeOptionalString as optionalString } from "@/lib/strings";
import { stableStringify } from "@/lib/workspace/revision";
import { createWorkspaceUpsertChange } from "@/features/workspace/server/workspace-change-builder";
import { commitAtomicWorkspaceMutation } from "@/features/workspace/server/workspace-atomic-commit";
import {
    persistWorkspaceChanges,
    type WorkspaceMutationChangeInput,
} from "@/features/workspace/server/workspace-sync-service";
import { accountTypeSupportsPlaid } from "@/modules/accounts/account-types";

const PLAID_SYNC_MUTATION_DURING_PAGINATION =
    "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";
const MAX_PLAID_SYNC_PAGINATION_RESTARTS = 2;
const SHARED_PLAID_ITEM_SCOPE = "global";

function clearAccountPlaidSummary(
    account: Awaited<ReturnType<typeof getAccountRecord>>,
    updatedAt: string,
) {
    return {
        accountId: account.accountId,
        accountType: account.accountType,
        createdAt: account.createdAt,
        ledgerAccountId: account.ledgerAccountId,
        ledgerId: account.ledgerId,
        name: account.name,
        openedOn: account.openedOn,
        openingBalanceCents: account.openingBalanceCents,
        updatedAt,
    };
}

function assertAccountSupportsPlaid(
    account: Awaited<ReturnType<typeof getAccountRecord>>,
) {
    if (accountTypeSupportsPlaid(account.accountType)) {
        return;
    }

    throw new HttpError(
        422,
        "plaid_account_type_unsupported",
        "Transfers accounts cannot be linked to Plaid or synced with Plaid.",
    );
}

type PlaidWorkspaceMutationResult = {
    changed: boolean;
    workspaceChanges: WorkspaceMutationChangeInput[];
};

class PlaidSyncWorkspaceError extends HttpError {
    readonly workspaceChanges: WorkspaceMutationChangeInput[];

    constructor(
        error: HttpError,
        workspaceChanges: WorkspaceMutationChangeInput[],
    ) {
        super(error.status, error.code, error.message, error.details);
        this.workspaceChanges = workspaceChanges;
    }
}

type PlaidAtomicWorkspaceWriteInput = {
    accountsToPut?: Awaited<ReturnType<typeof getAccountRecord>>[];
    linksToPut?: PlaidAccountLinkRecord[];
    mutationId: string;
    mutationType: string;
    sharedItemsToPut?: PlaidSharedItemRecord[];
    syncRecordsToPut?: PlaidTransactionSyncRecord[];
    syncStatesToPut?: PlaidItemSyncStateRecord[];
    ledgerId: string;
    workspaceChanges: WorkspaceMutationChangeInput[];
};

async function writePlaidWorkspaceMutation(
    input: PlaidAtomicWorkspaceWriteInput,
) {
    if (input.workspaceChanges.length === 0) {
        throw new Error("Plaid workspace mutations require visible changes.");
    }

    const domainItemCount =
        (input.accountsToPut?.length ?? 0) +
        (input.linksToPut?.length ?? 0) +
        (input.sharedItemsToPut?.length ?? 0) +
        (input.syncRecordsToPut?.length ?? 0) +
        (input.syncStatesToPut?.length ?? 0);
    const result = await commitAtomicWorkspaceMutation({
        buildDomainItems: (entities) => [
            ...(input.accountsToPut?.map((account) =>
                entities.accounts.put(account).commit(),
            ) ?? []),
            ...(input.linksToPut?.map((link) =>
                entities.plaidAccountLinks.put(link).commit(),
            ) ?? []),
            ...(input.sharedItemsToPut?.map((item) =>
                entities.plaidSharedItems.put(item).commit(),
            ) ?? []),
            ...(input.syncRecordsToPut?.map((record) =>
                entities.plaidTransactionSyncs.put(record).commit(),
            ) ?? []),
            ...(input.syncStatesToPut?.map((state) =>
                entities.plaidItemSyncStates.put(state).commit(),
            ) ?? []),
        ],
        changes: input.workspaceChanges,
        domainItemCount,
        ledgerId: input.ledgerId,
        maxItemCount: 25,
        mutationId: input.mutationId,
        mutationType: input.mutationType,
        response: {},
    });

    return result.workspaceChanges;
}

export type PlaidLedgerScope = {
    ledgerId: string;
};

export type PlaidAccountLinkRecord = {
    accountId: string;
    createdAt: string;
    lastSyncError?: string;
    lastSyncStatus: "failed" | "never" | "succeeded";
    lastSyncedAt?: string;
    plaidAccountId: string;
    plaidAccountLinkId: string;
    plaidAccountMask?: string;
    plaidAccountName?: string;
    plaidAccountOfficialName?: string;
    plaidAccountSubtype?: string;
    plaidAccountType?: string;
    plaidBalanceAvailableCents?: number;
    plaidBalanceCurrentCents?: number;
    plaidBalanceIsoCurrencyCode?: string;
    plaidBalanceLastSyncedAt?: string;
    plaidBalanceLimitCents?: number;
    plaidBalanceSyncError?: string;
    plaidBalanceSyncStatus?: "failed" | "never" | "succeeded";
    plaidBalanceUnofficialCurrencyCode?: string;
    plaidInstitutionId?: string;
    plaidInstitutionLogo?: string;
    plaidInstitutionName?: string;
    plaidInstitutionPrimaryColor?: string;
    plaidInstitutionUrl?: string;
    plaidItemId: string;
    status: "disabled" | "error" | "linked";
    syncStartDate: string;
    updatedAt: string;
    ledgerId: string;
};

type PlaidItemSyncStateRecord = {
    createdAt: string;
    lastSyncError?: string;
    lastSyncedAt?: string;
    plaidItemId: string;
    status: "active" | "error";
    syncCursor?: string;
    updatedAt: string;
    ledgerId: string;
};

type PlaidSharedItemRecord = {
    accessToken: string;
    createdAt: string;
    institutionId?: string;
    institutionName?: string;
    lastSyncError?: string;
    plaidItemId: string;
    sharedScope: string;
    status: "active" | "error";
    updatedAt: string;
};

export type PlaidReusableInstitutionRecord = {
    institutionId?: string;
    institutionName?: string;
    plaidItemId: string;
    status: "active" | "error";
    updatedAt: string;
};

export type PlaidTransactionSyncRecord = {
    accountId: string;
    authorizedDate?: string;
    categoryText?: string;
    firstSyncedAt: string;
    isoCurrencyCode?: string;
    lastSyncedAt: string;
    ledgerId: string;
    merchantName?: string;
    name: string;
    originalDescription?: string;
    pending: boolean;
    pendingTransactionId?: string;
    personalFinanceCategoryConfidence?: string;
    personalFinanceCategoryDetailed?: string;
    personalFinanceCategoryPrimary?: string;
    plaidAccountId: string;
    plaidAccountLinkId: string;
    plaidAmountCents: number;
    plaidDate: string;
    plaidItemId: string;
    plaidPayloadJson: string;
    plaidTransactionId: string;
    plaidTransactionSyncId: string;
    removedAt?: string;
    status: "active" | "removed";
    transactionId: string;
    updatedAt: string;
};

type PlaidImportAccount = Pick<
    Awaited<ReturnType<typeof getAccountRecord>>,
    "accountId" | "accountType" | "ledgerAccountId" | "plaidAccountSubtype"
>;

type PlaidImportLink = Pick<
    PlaidAccountLinkRecord,
    "plaidAccountSubtype" | "plaidAccountType"
>;

type BudgetedAccountType = Awaited<
    ReturnType<typeof getAccountRecord>
>["accountType"];

type PlaidApiErrorDetails = {
    errorCode?: string;
    errorType?: string;
    httpStatus: number;
    message: string;
    requestId?: string;
};

type PlaidInstitutionMetadata = {
    logo?: string;
    name?: string;
    primaryColor?: string;
    url?: string;
};

type PlaidTransactionSyncUpdates = {
    added: Transaction[];
    cursor: string | undefined;
    modified: Transaction[];
    removed: RemovedTransaction[];
};

type PlaidLinkAccountMetadata = {
    id: string;
    mask?: string | null;
    name?: string | null;
    subtype?: string | null;
    type?: string | null;
};

type PlaidBudgetedTransactionRecord = {
    displayAmountCents: number;
    kind: "adjustment" | "standard";
    memo?: string;
    occurredAt: string;
    payee?: string;
    periodId: string;
    plaidTransactionSyncId?: string;
    referenceAccountId: string;
    source?: "manual" | "plaid" | "venmo";
    status: "entered" | "cleared" | "reconciled" | "voided";
    transactionId: string;
    updatedAt: string;
    ledgerId: string;
};

async function getPlaidInstitutionMetadata(
    institutionId: string | undefined,
): Promise<PlaidInstitutionMetadata> {
    if (!institutionId) {
        return {};
    }

    try {
        const response = await getPlaidClient().institutionsGetById({
            country_codes: plaidCountryCodes,
            institution_id: institutionId,
            options: {
                include_optional_metadata: true,
            },
        });
        const institution = response.data.institution;

        return {
            logo: optionalString(institution.logo),
            name: optionalString(institution.name),
            primaryColor: optionalString(institution.primary_color),
            url: optionalString(institution.url),
        };
    } catch {
        return {};
    }
}

function getObjectProperty(value: unknown, key: string) {
    return typeof value === "object" && value !== null
        ? Reflect.get(value, key)
        : undefined;
}

function getPlaidApiErrorDetails(error: unknown): PlaidApiErrorDetails | null {
    const response = getObjectProperty(error, "response");
    const httpStatus = getObjectProperty(response, "status");

    if (typeof httpStatus !== "number") {
        return null;
    }

    const data = getObjectProperty(response, "data");
    const displayMessage = getObjectProperty(data, "display_message");
    const errorMessage = getObjectProperty(data, "error_message");
    const errorCode = getObjectProperty(data, "error_code");
    const errorType = getObjectProperty(data, "error_type");
    const requestId = getObjectProperty(data, "request_id");
    const message =
        (typeof displayMessage === "string" && displayMessage.trim()) ||
        (typeof errorMessage === "string" && errorMessage.trim()) ||
        `Plaid request failed with status ${httpStatus}.`;

    return {
        errorCode: typeof errorCode === "string" ? errorCode : undefined,
        errorType: typeof errorType === "string" ? errorType : undefined,
        httpStatus,
        message,
        requestId: typeof requestId === "string" ? requestId : undefined,
    };
}

function toPlaidHttpError(error: unknown, code: string) {
    if (error instanceof HttpError) {
        return error;
    }

    const plaidError = getPlaidApiErrorDetails(error);

    if (!plaidError) {
        return error;
    }

    return new HttpError(502, code, plaidError.message, {
        errorCode: plaidError.errorCode,
        errorType: plaidError.errorType,
        httpStatus: plaidError.httpStatus,
        requestId: plaidError.requestId,
    });
}

function toPlaidSyncHttpError(error: unknown): HttpError {
    const normalized = toPlaidHttpError(error, "plaid_sync_failed");

    if (normalized instanceof HttpError) {
        return normalized;
    }

    return new HttpError(
        502,
        "plaid_sync_failed",
        normalized instanceof Error
            ? normalized.message
            : "Unable to sync Plaid transactions.",
    );
}

function isPlaidSyncMutationDuringPagination(error: unknown) {
    return (
        getPlaidApiErrorDetails(error)?.errorCode ===
        PLAID_SYNC_MUTATION_DURING_PAGINATION
    );
}

function toPlaidBalanceHttpError(error: unknown) {
    const normalized = toPlaidHttpError(error, "plaid_balance_sync_failed");

    if (normalized instanceof HttpError) {
        return normalized;
    }

    return new HttpError(
        502,
        "plaid_balance_sync_failed",
        normalized instanceof Error
            ? normalized.message
            : "Unable to sync Plaid balance.",
    );
}

function getSelectedPlaidAccount(input: PlaidExchangeRequest): {
    account?: PlaidLinkAccountMetadata;
    plaidAccountId: string;
} {
    const selectedAccountId =
        input.plaidAccountId ?? input.accounts?.[0]?.id ?? "";
    const account = input.accounts?.find(
        (candidate) => candidate.id === selectedAccountId,
    );

    if (!selectedAccountId) {
        throw new HttpError(
            422,
            "plaid_account_required",
            "Select a Plaid account to link.",
        );
    }

    return {
        account,
        plaidAccountId: selectedAccountId,
    };
}

function toPlaidLinkAccountMetadata(
    account: AccountBase,
): PlaidLinkAccountMetadata {
    return {
        id: account.account_id,
        mask: account.mask,
        name: account.name,
        subtype: account.subtype,
        type: account.type,
    };
}

function mergePlaidAccountMetadata(input: {
    linkMetadata?: PlaidLinkAccountMetadata;
    verifiedAccount: AccountBase;
}): PlaidLinkAccountMetadata {
    const verified = toPlaidLinkAccountMetadata(input.verifiedAccount);

    return {
        id: verified.id,
        mask: input.linkMetadata?.mask ?? verified.mask,
        name: input.linkMetadata?.name ?? verified.name,
        subtype: input.linkMetadata?.subtype ?? verified.subtype,
        type: input.linkMetadata?.type ?? verified.type,
    };
}

function normalizeComparableText(value: string | null | undefined) {
    return optionalString(value)?.trim() ?? "";
}

function selectPlaidSyncedText(input: {
    current: string | undefined;
    nextPlaid: string | undefined;
    previousPlaid: string | undefined;
}) {
    const current = normalizeComparableText(input.current);
    const previousPlaid = normalizeComparableText(input.previousPlaid);

    if (!current || current === previousPlaid) {
        return optionalString(input.nextPlaid);
    }

    return optionalString(input.current);
}

function createPlaidSyncId(
    ledgerId: string,
    accountId: string,
    plaidTransactionId: string,
) {
    return `${ledgerId}:${accountId}:${plaidTransactionId}`;
}

function toCents(amount: number) {
    return Math.round(amount * 100);
}

function toOptionalCents(amount: number | null | undefined) {
    return typeof amount === "number" ? toCents(amount) : undefined;
}

function normalizePlaidText(value: string | null | undefined) {
    return value?.trim().toLowerCase();
}

function getBudgetedAccountTypeFromPlaidLink(
    link: PlaidImportLink,
): BudgetedAccountType | undefined {
    const plaidAccountType = normalizePlaidText(link.plaidAccountType);
    const plaidAccountSubtype = normalizePlaidText(link.plaidAccountSubtype);

    if (plaidAccountType === "credit" || plaidAccountSubtype === "credit card") {
        return "creditCard";
    }

    if (plaidAccountType === "loan") {
        return "tracking";
    }

    if (plaidAccountType === "depository") {
        if (plaidAccountSubtype === "savings") {
            return "savings";
        }

        if (plaidAccountSubtype === "checking") {
            return "checking";
        }
    }

    return undefined;
}

function getPlaidDisplayAmountCents(input: {
    account: PlaidImportAccount;
    link?: PlaidImportLink;
    plaidTransaction: Transaction;
}) {
    const plaidAmountCents = toCents(input.plaidTransaction.amount);

    return -plaidAmountCents;
}

function getPlaidDisplayName(transaction: Transaction) {
    return (
        optionalString(transaction.merchant_name) ??
        optionalString(transaction.name) ??
        "Plaid transaction"
    );
}

function tokenizePlaidDescription(value: string | null | undefined) {
    return (
        optionalString(value)
            ?.toLowerCase()
            .match(/[a-z0-9]+/g) ?? []
    );
}

function getSignalPlaidDescriptionTokens(tokens: string[]) {
    const signalTokens = tokens.filter(
        (token) => token.length > 3 || /\d/.test(token),
    );

    return signalTokens.length > 0 ? signalTokens : tokens;
}

function getPlaidImportMemo(input: {
    originalDescription: string | null | undefined;
    payee: string;
}) {
    const originalDescription = optionalString(input.originalDescription);

    if (!originalDescription) {
        return undefined;
    }

    const memoTokens = tokenizePlaidDescription(originalDescription);
    const payeeTokens = tokenizePlaidDescription(input.payee);

    if (memoTokens.join(" ") === payeeTokens.join(" ")) {
        return undefined;
    }

    const memoSignalTokens = getSignalPlaidDescriptionTokens(memoTokens);
    const payeeSignalTokens = getSignalPlaidDescriptionTokens(payeeTokens);
    const payeeTokenSet = new Set(payeeSignalTokens);
    const isMemoOnlyPayeeText =
        memoSignalTokens.length > 0 &&
        memoSignalTokens.every((token) => payeeTokenSet.has(token));

    return isMemoOnlyPayeeText ? undefined : originalDescription;
}

function getPlaidOccurredAt(transaction: Transaction) {
    const date = transaction.authorized_date ?? transaction.date;
    return toTransactionOccurredAt(date);
}

function getPlaidCategoryText(transaction: Transaction) {
    const personalCategory = transaction.personal_finance_category;

    if (personalCategory?.primary || personalCategory?.detailed) {
        return [personalCategory.primary, personalCategory.detailed]
            .filter(Boolean)
            .join(" / ");
    }

    return transaction.category?.join(" / ");
}

export function createPlaidTransactionSyncRecord(input: {
    existing?: PlaidTransactionSyncRecord;
    ledgerId: string;
    link: PlaidAccountLinkRecord;
    now: string;
    plaidTransaction: Transaction;
    transactionId: string;
}): PlaidTransactionSyncRecord {
    const transaction = input.plaidTransaction;
    const personalCategory = transaction.personal_finance_category;

    return {
        accountId: input.link.accountId,
        authorizedDate: optionalString(transaction.authorized_date),
        categoryText: optionalString(getPlaidCategoryText(transaction)),
        firstSyncedAt: input.existing?.firstSyncedAt ?? input.now,
        isoCurrencyCode: optionalString(transaction.iso_currency_code),
        lastSyncedAt: input.now,
        ledgerId: input.ledgerId,
        merchantName: optionalString(transaction.merchant_name),
        name: getPlaidDisplayName(transaction),
        originalDescription: optionalString(transaction.original_description),
        pending: transaction.pending,
        pendingTransactionId: optionalString(transaction.pending_transaction_id),
        personalFinanceCategoryConfidence: optionalString(
            personalCategory?.confidence_level,
        ),
        personalFinanceCategoryDetailed: optionalString(personalCategory?.detailed),
        personalFinanceCategoryPrimary: optionalString(personalCategory?.primary),
        plaidAccountId: input.link.plaidAccountId,
        plaidAccountLinkId: input.link.plaidAccountLinkId,
        plaidAmountCents: toCents(transaction.amount),
        plaidDate: transaction.date,
        plaidItemId: input.link.plaidItemId,
        plaidPayloadJson: stableStringify(transaction),
        plaidTransactionId: transaction.transaction_id,
        plaidTransactionSyncId:
            input.existing?.plaidTransactionSyncId ??
            createPlaidSyncId(
                input.ledgerId,
                input.link.accountId,
                transaction.transaction_id,
            ),
        status: "active",
        transactionId: input.transactionId,
        updatedAt: input.now,
    };
}

export function createPlaidImportedTransactionInput(input: {
    account: PlaidImportAccount;
    link?: PlaidImportLink;
    plaidTransaction: Transaction;
    plaidTransactionSyncId: string;
    transactionId?: string;
}) {
    const displayAmountCents = getPlaidDisplayAmountCents(input);
    const amountCents = Math.abs(displayAmountCents);
    const payee = getPlaidDisplayName(input.plaidTransaction);
    const memo = getPlaidImportMemo({
        originalDescription: input.plaidTransaction.original_description,
        payee,
    });

    if (amountCents === 0) {
        throw new HttpError(
            422,
            "plaid_zero_amount",
            "Plaid transactions with a zero amount cannot be imported.",
        );
    }

    if (displayAmountCents < 0) {
        return {
            accountId: input.account.accountId,
            kind: "standard" as const,
            lines: [
                {
                    amountCents,
                    fromAccountId: input.account.accountId,
                },
            ],
            memo,
            occurredAt: getPlaidOccurredAt(input.plaidTransaction),
            payee,
            plaidTransactionSyncId: input.plaidTransactionSyncId,
            source: "plaid" as const,
            ...(input.transactionId ? { transactionId: input.transactionId } : {}),
        };
    }

    return {
        accountId: input.account.accountId,
        kind: "standard" as const,
        lines: [
            {
                amountCents,
                toAccountId: input.account.accountId,
            },
        ],
        memo,
        occurredAt: getPlaidOccurredAt(input.plaidTransaction),
        payee,
        plaidTransactionSyncId: input.plaidTransactionSyncId,
        source: "plaid" as const,
        ...(input.transactionId ? { transactionId: input.transactionId } : {}),
    };
}

export function shouldImportPlaidTransactionForLink(
    link: Pick<PlaidAccountLinkRecord, "plaidAccountId" | "syncStartDate">,
    transaction: Pick<Transaction, "account_id" | "date">,
) {
    return (
        transaction.account_id === link.plaidAccountId &&
        transaction.date >= link.syncStartDate
    );
}

function toSharedPlaidItemRecord(item: {
    accessToken: string;
    createdAt: string;
    institutionId?: string;
    institutionName?: string;
    lastSyncError?: string;
    plaidItemId: string;
    status: "active" | "error";
    updatedAt: string;
}): PlaidSharedItemRecord {
    return {
        accessToken: item.accessToken,
        createdAt: item.createdAt,
        institutionId: item.institutionId,
        institutionName: item.institutionName,
        lastSyncError: item.lastSyncError,
        plaidItemId: item.plaidItemId,
        sharedScope: SHARED_PLAID_ITEM_SCOPE,
        status: item.status,
        updatedAt: item.updatedAt,
    };
}

async function getSharedPlaidItem(plaidItemId: string) {
    const { entities } = getBudgetedSchema();
    const result = await entities.plaidSharedItems
        .get({
            sharedScope: SHARED_PLAID_ITEM_SCOPE,
            plaidItemId,
        })
        .go();

    return result.data as PlaidSharedItemRecord | undefined;
}

async function listSharedPlaidItems() {
    const { entities } = getBudgetedSchema();

    return queryAllPages(
        entities.plaidSharedItems.query.byItem({
            sharedScope: SHARED_PLAID_ITEM_SCOPE,
        }),
        { consistent: true },
    ) as Promise<PlaidSharedItemRecord[]>;
}

function sortReusableSharedItems(
    left: PlaidSharedItemRecord,
    right: PlaidSharedItemRecord,
) {
    if (left.status !== right.status) {
        return left.status === "active" ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
}

export async function listReusablePlaidInstitutions(): Promise<
    PlaidReusableInstitutionRecord[]
> {
    return (await listSharedPlaidItems())
        .filter((item) => item.institutionId || item.institutionName)
        .sort((left, right) => {
            const nameComparison = (left.institutionName ?? "").localeCompare(
                right.institutionName ?? "",
            );

            if (nameComparison !== 0) {
                return nameComparison;
            }

            return sortReusableSharedItems(left, right);
        })
        .map((item) => ({
            institutionId: item.institutionId,
            institutionName: item.institutionName,
            plaidItemId: item.plaidItemId,
            status: item.status,
            updatedAt: item.updatedAt,
        }));
}

async function getRequiredSharedPlaidItem(plaidItemId: string) {
    const item = await getSharedPlaidItem(plaidItemId);

    if (!item) {
        throw new HttpError(
            404,
            "plaid_item_missing",
            "The Plaid item access token could not be found.",
        );
    }

    return item;
}

async function getPlaidItemSyncState(ledgerId: string, plaidItemId: string) {
    const { entities } = getBudgetedSchema();
    const result = await entities.plaidItemSyncStates
        .get({ ledgerId, plaidItemId })
        .go();

    return result.data as PlaidItemSyncStateRecord | undefined;
}

function createPlaidItemSyncState(input: {
    ledgerId: string;
    now: string;
    plaidItemId: string;
    status?: "active" | "error";
}): PlaidItemSyncStateRecord {
    return {
        createdAt: input.now,
        ledgerId: input.ledgerId,
        plaidItemId: input.plaidItemId,
        status: input.status ?? "active",
        updatedAt: input.now,
    };
}

async function getOrCreatePlaidItemSyncState(input: {
    ledgerId: string;
    now?: string;
    plaidItemId: string;
}) {
    const existing = await getPlaidItemSyncState(
        input.ledgerId,
        input.plaidItemId,
    );

    return (
        existing ??
        createPlaidItemSyncState({
            ledgerId: input.ledgerId,
            now: input.now ?? new Date().toISOString(),
            plaidItemId: input.plaidItemId,
        })
    );
}

async function getReusablePlaidItemForAccount(
    ledgerId: string,
    accountId: string,
) {
    const link = await getActivePlaidLinkForAccount(ledgerId, accountId);

    if (!link) {
        return null;
    }

    return getRequiredSharedPlaidItem(link.plaidItemId);
}

async function listPlaidLinksForAccount(ledgerId: string, accountId: string) {
    const { entities } = getBudgetedSchema();
    const result = await entities.plaidAccountLinks.query
        .byAccount({ ledgerId, accountId })
        .go();

    return result.data as PlaidAccountLinkRecord[];
}

async function getActivePlaidLinkForAccount(
    ledgerId: string,
    accountId: string,
) {
    const links = await listPlaidLinksForAccount(ledgerId, accountId);

    return (
        links
            .filter((link) => link.status === "linked" || link.status === "error")
            .sort((left, right) =>
                right.updatedAt.localeCompare(left.updatedAt),
            )[0] ?? null
    );
}

async function listActivePlaidLinksForItem(
    ledgerId: string,
    plaidItemId: string,
) {
    const { entities } = getBudgetedSchema();
    const links = (await queryAllPages(
        entities.plaidAccountLinks.query.byPlaidAccount({
            ledgerId,
            plaidItemId,
        }),
    )) as PlaidAccountLinkRecord[];

    return links
        .filter((link) => link.status === "linked" || link.status === "error")
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function includeRequestedPlaidLink(input: {
    links: PlaidAccountLinkRecord[];
    requestedLink: PlaidAccountLinkRecord;
}) {
    const linksById = new Map<string, PlaidAccountLinkRecord>();

    for (const link of input.links) {
        linksById.set(link.plaidAccountLinkId, link);
    }

    linksById.set(input.requestedLink.plaidAccountLinkId, input.requestedLink);

    return [...linksById.values()]
        .filter(
            (link) =>
                link.plaidItemId === input.requestedLink.plaidItemId &&
                (link.status === "linked" || link.status === "error"),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function indexPlaidLinksByPlaidAccountId(links: PlaidAccountLinkRecord[]) {
    const linksByPlaidAccountId = new Map<string, PlaidAccountLinkRecord>();

    for (const link of links) {
        if (!linksByPlaidAccountId.has(link.plaidAccountId)) {
            linksByPlaidAccountId.set(link.plaidAccountId, link);
        }
    }

    return linksByPlaidAccountId;
}

async function assertPlaidAccountIsAvailableForLink(input: {
    accountId: string;
    ledgerId: string;
    plaidAccountId: string;
    plaidItemId: string;
}) {
    const activeLinks = await listActivePlaidLinksForItem(
        input.ledgerId,
        input.plaidItemId,
    );
    const existingLink = activeLinks.find(
        (link) =>
            link.accountId !== input.accountId &&
            link.plaidAccountId === input.plaidAccountId,
    );

    if (existingLink) {
        throw new HttpError(
            409,
            "plaid_account_already_linked",
            "That Plaid account is already linked to another account in this ledger.",
        );
    }
}

function createLedgerTransactionLookup(ledgerId: string) {
    let transactionsPromise:
        | Promise<Map<string, PlaidBudgetedTransactionRecord>>
        | undefined;

    async function loadTransactions() {
        const { entities } = getBudgetedSchema();
        const transactions = (await queryAllPages(
            entities.transactions.query.byTransaction({ ledgerId }),
            { consistent: true },
        )) as PlaidBudgetedTransactionRecord[];

        return new Map(
            transactions.map((transaction) => [
                transaction.transactionId,
                transaction,
            ]),
        );
    }

    async function getTransactions() {
        transactionsPromise ??= loadTransactions();

        return transactionsPromise;
    }

    return {
        async get(transactionId: string) {
            return (await getTransactions()).get(transactionId);
        },
        async has(transactionId: string) {
            return (await getTransactions()).has(transactionId);
        },
    };
}

async function createPlaidChildWorkspaceChanges(input: {
    existing: PlaidTransactionSyncRecord | null;
    record: PlaidTransactionSyncRecord;
    transactionLookup: ReturnType<typeof createLedgerTransactionLookup>;
}) {
    const transaction = await input.transactionLookup.get(
        input.record.transactionId,
    );

    if (!transaction) {
        throw new Error(
            `Plaid sync record ${input.record.plaidTransactionSyncId} references missing transaction ${input.record.transactionId}.`,
        );
    }

    return [
        createWorkspaceUpsertChange({
            entityId: transaction.transactionId,
            entityType: "transaction",
            previousRecord: transaction,
            record: transaction,
        }),
        createWorkspaceUpsertChange({
            entityId: input.record.plaidTransactionSyncId,
            entityType: "plaidTransactionSync",
            previousRecord: input.existing,
            record: input.record,
        }),
    ];
}

async function listPlaidTransactionSyncsForPlaidTransaction(
    ledgerId: string,
    accountId: string,
    plaidTransactionId: string,
) {
    const { entities } = getBudgetedSchema();
    const result = await entities.plaidTransactionSyncs.query
        .byPlaidTransaction({ ledgerId, accountId })
        .begins({ plaidTransactionId })
        .go();

    return (result.data as PlaidTransactionSyncRecord[]).filter(
        (record) => record.plaidTransactionId === plaidTransactionId,
    );
}

async function findPlaidTransactionSyncWithBudgetedTransaction(
    candidates: PlaidTransactionSyncRecord[],
    transactionLookup: ReturnType<typeof createLedgerTransactionLookup>,
) {
    for (const candidate of candidates) {
        if (await transactionLookup.has(candidate.transactionId)) {
            return candidate;
        }
    }

    return undefined;
}

function createAccountPlaidSummary(
    account: Awaited<ReturnType<typeof getAccountRecord>>,
    link: PlaidAccountLinkRecord,
) {
    const accountType =
        account.accountType === "tracking"
            ? account.accountType
            : (getBudgetedAccountTypeFromPlaidLink(link) ?? account.accountType);

    return {
        ...account,
        accountType,
        plaidAccountLinkId: link.plaidAccountLinkId,
        plaidAccountMask: link.plaidAccountMask,
        plaidAccountName: link.plaidAccountName,
        plaidAccountSubtype: link.plaidAccountSubtype,
        plaidBalanceAvailableCents: link.plaidBalanceAvailableCents,
        plaidBalanceCurrentCents: link.plaidBalanceCurrentCents,
        plaidBalanceIsoCurrencyCode: link.plaidBalanceIsoCurrencyCode,
        plaidBalanceLastSyncedAt: link.plaidBalanceLastSyncedAt,
        plaidBalanceLimitCents: link.plaidBalanceLimitCents,
        plaidBalanceSyncError: link.plaidBalanceSyncError,
        plaidBalanceSyncStatus: link.plaidBalanceSyncStatus,
        plaidBalanceUnofficialCurrencyCode: link.plaidBalanceUnofficialCurrencyCode,
        plaidInstitutionLogo: link.plaidInstitutionLogo,
        plaidInstitutionName: link.plaidInstitutionName,
        plaidInstitutionPrimaryColor: link.plaidInstitutionPrimaryColor,
        plaidInstitutionUrl: link.plaidInstitutionUrl,
        plaidLastSyncedAt: link.lastSyncedAt,
        plaidLastSyncStatus: link.lastSyncStatus,
        plaidLinkStatus: link.status,
        plaidSyncStartDate: link.syncStartDate,
        updatedAt: link.updatedAt,
    };
}

async function createSharedPlaidItemFromPublicToken(input: {
    institutionId: string | undefined;
    institutionName: string | undefined;
    now: string;
    publicToken: string;
}) {
    const exchange = await getPlaidClient().itemPublicTokenExchange({
        public_token: input.publicToken,
    });

    return toSharedPlaidItemRecord({
        accessToken: exchange.data.access_token,
        createdAt: input.now,
        institutionId: input.institutionId,
        institutionName: input.institutionName,
        plaidItemId: exchange.data.item_id,
        status: "active",
        updatedAt: input.now,
    });
}

async function resolveSharedPlaidItemForExchange(input: {
    institutionId: string | undefined;
    institutionName: string | undefined;
    now: string;
    plaidItemId: string | undefined;
    publicToken: string | undefined;
}) {
    const reusableItem = input.plaidItemId
        ? await getRequiredSharedPlaidItem(input.plaidItemId)
        : undefined;

    if (reusableItem) {
        return {
            shouldStoreSharedItem: false,
            sharedItem: reusableItem,
        };
    }

    if (!input.publicToken) {
        throw new HttpError(
            422,
            "plaid_public_token_required",
            "Plaid Link did not return a token for this new institution.",
        );
    }

    return {
        shouldStoreSharedItem: true,
        sharedItem: await createSharedPlaidItemFromPublicToken({
            institutionId: input.institutionId,
            institutionName: input.institutionName,
            now: input.now,
            publicToken: input.publicToken,
        }),
    };
}

async function getVerifiedPlaidAccountForSharedItem(input: {
    plaidAccountId: string;
    sharedItem: PlaidSharedItemRecord;
}) {
    const response = await getPlaidClient().accountsGet({
        access_token: input.sharedItem.accessToken,
    });
    const account = response.data.accounts.find(
        (candidate) => candidate.account_id === input.plaidAccountId,
    );

    if (!account) {
        throw new HttpError(
            422,
            "plaid_account_not_found",
            "The selected Plaid account does not belong to the linked institution.",
        );
    }

    return account;
}

async function markPlaidBalanceSyncFailed(input: {
    account: Awaited<ReturnType<typeof getAccountRecord>>;
    error: unknown;
    link: PlaidAccountLinkRecord;
}) {
    const now = new Date().toISOString();
    const message =
        input.error instanceof Error
            ? input.error.message
            : "Unable to sync Plaid balance.";

    const failedLink = {
        ...input.link,
        plaidBalanceSyncError: message,
        plaidBalanceSyncStatus: "failed" as const,
        updatedAt: now,
    };
    const failedAccount = createAccountPlaidSummary(input.account, failedLink);

    await writePlaidWorkspaceMutation({
        accountsToPut: [failedAccount],
        ledgerId: input.account.ledgerId,
        linksToPut: [failedLink],
        mutationId: `plaid.balance:${failedLink.plaidAccountLinkId}:${failedLink.updatedAt}`,
        mutationType: "plaid.balance",
        workspaceChanges: [
            createWorkspaceUpsertChange({
                entityId: failedAccount.accountId,
                entityType: "account",
                previousRecord: input.account,
                record: failedAccount,
            }),
            createWorkspaceUpsertChange({
                entityId: failedLink.plaidAccountLinkId,
                entityType: "plaidAccountLink",
                previousRecord: input.link,
                record: failedLink,
            }),
        ],
    });
}

async function updatePlaidLinkSyncStartDate(input: {
    account: Awaited<ReturnType<typeof getAccountRecord>>;
    link: PlaidAccountLinkRecord;
    syncStartDate: string;
}) {
    const now = new Date().toISOString();
    const isMovingEarlier = input.syncStartDate < input.link.syncStartDate;
    const nextLink = {
        ...input.link,
        syncStartDate: input.syncStartDate,
        updatedAt: now,
    };

    const updatedAccount = createAccountPlaidSummary(input.account, nextLink);
    const syncState = isMovingEarlier
        ? {
                ...(await getOrCreatePlaidItemSyncState({
                    ledgerId: input.link.ledgerId,
                    now,
                    plaidItemId: input.link.plaidItemId,
                })),
                lastSyncError: undefined,
                status: "active" as const,
                syncCursor: undefined,
                updatedAt: now,
            }
        : undefined;

    await writePlaidWorkspaceMutation({
        accountsToPut: [updatedAccount],
        ledgerId: input.link.ledgerId,
        linksToPut: [nextLink],
        mutationId: `plaid.sync-start:${nextLink.plaidAccountLinkId}:${nextLink.updatedAt}`,
        mutationType: "plaid.sync-start",
        syncStatesToPut: syncState ? [syncState] : [],
        workspaceChanges: [
            createWorkspaceUpsertChange({
                entityId: nextLink.plaidAccountLinkId,
                entityType: "plaidAccountLink",
                previousRecord: input.link,
                record: nextLink,
            }),
            createWorkspaceUpsertChange({
                entityId: updatedAccount.accountId,
                entityType: "account",
                previousRecord: input.account,
                record: updatedAccount,
            }),
        ],
    });
}

export async function createPlaidLinkToken(
    scope: PlaidLedgerScope,
    accountId: string,
    input: { accountSelectionEnabled?: boolean; plaidItemId?: string } = {},
) {
    const ledgerId = scope.ledgerId;
    const account = await getAccountRecord(ledgerId, accountId);

    assertAccountSupportsPlaid(account);
    const shouldEnableAccountSelection =
        Boolean(input.plaidItemId) || input.accountSelectionEnabled === true;
    const reusableItem = input.plaidItemId
        ? await getRequiredSharedPlaidItem(input.plaidItemId)
        : await getReusablePlaidItemForAccount(ledgerId, accountId);
    const baseRequest = {
        client_name: "Budgeted",
        country_codes: plaidCountryCodes,
        language: "en" as const,
        user: {
            client_user_id: scope.ledgerId,
        },
    };
    const request = reusableItem
        ? {
                ...baseRequest,
                access_token: reusableItem.accessToken,
                ...(shouldEnableAccountSelection
                    ? {
                            update: {
                                account_selection_enabled: true,
                            },
                        }
                    : {}),
            }
        : {
                ...baseRequest,
                products: plaidProducts,
                transactions: {
                    days_requested: 730,
                },
            };

    const response = await getPlaidClient().linkTokenCreate(request);

    return {
        linkToken: response.data.link_token,
        mode: reusableItem ? "update" : "create",
        plaidItemId: reusableItem?.plaidItemId,
    };
}

export async function exchangePlaidPublicTokenAndSync(
    scope: PlaidLedgerScope,
    input: PlaidExchangeRequest,
) {
    const ledgerId = scope.ledgerId;
    const account = await getAccountRecord(ledgerId, input.accountId);

    assertAccountSupportsPlaid(account);
    const { account: selectedAccount, plaidAccountId } =
        getSelectedPlaidAccount(input);
    const now = new Date().toISOString();
    const institutionId =
        optionalString(input.institution?.institution_id) ?? undefined;
    const institutionMetadata = await getPlaidInstitutionMetadata(institutionId);
    const institutionName =
        institutionMetadata.name ?? optionalString(input.institution?.name);
    const { sharedItem, shouldStoreSharedItem } =
        await resolveSharedPlaidItemForExchange({
            institutionId,
            institutionName,
            now,
            plaidItemId: input.plaidItemId,
            publicToken: input.publicToken,
        });
    const verifiedPlaidAccount = await getVerifiedPlaidAccountForSharedItem({
        plaidAccountId,
        sharedItem,
    });
    const selectedAccountMetadata = mergePlaidAccountMetadata({
        linkMetadata: selectedAccount,
        verifiedAccount: verifiedPlaidAccount,
    });
    await assertPlaidAccountIsAvailableForLink({
        accountId: account.accountId,
        ledgerId,
        plaidAccountId,
        plaidItemId: sharedItem.plaidItemId,
    });
    const linkInstitutionId = institutionId ?? sharedItem.institutionId;
    const linkInstitutionName = institutionName ?? sharedItem.institutionName;
    const linkInstitutionMetadata = linkInstitutionId ? institutionMetadata : {};
    const sharedItemToStore = shouldStoreSharedItem
        ? sharedItem
        : {
                ...sharedItem,
                institutionId: sharedItem.institutionId ?? institutionId,
                institutionName: sharedItem.institutionName ?? institutionName,
                updatedAt: now,
            };
    const link: PlaidAccountLinkRecord = {
        accountId: account.accountId,
        createdAt: now,
        lastSyncStatus: "never",
        plaidAccountId,
        plaidAccountLinkId: ulid(),
        plaidAccountMask: optionalString(selectedAccountMetadata.mask),
        plaidAccountName: optionalString(selectedAccountMetadata.name),
        plaidAccountSubtype: optionalString(selectedAccountMetadata.subtype),
        plaidAccountType: optionalString(selectedAccountMetadata.type),
        plaidInstitutionId: linkInstitutionId,
        plaidInstitutionLogo: linkInstitutionMetadata.logo,
        plaidInstitutionName: linkInstitutionName,
        plaidInstitutionPrimaryColor: linkInstitutionMetadata.primaryColor,
        plaidInstitutionUrl: linkInstitutionMetadata.url,
        plaidItemId: sharedItem.plaidItemId,
        status: "linked",
        syncStartDate: input.syncStartDate,
        updatedAt: now,
        ledgerId,
    };
    const existingLinks = await listPlaidLinksForAccount(
        ledgerId,
        account.accountId,
    );
    const disabledLinks = existingLinks
        .filter(
            (existingLink) =>
                existingLink.status === "linked" || existingLink.status === "error",
        )
        .map((existingLink) => ({
            ...existingLink,
            status: "disabled" as const,
            updatedAt: now,
        }));
    const initialSyncState = {
        ...(await getOrCreatePlaidItemSyncState({
            ledgerId,
            now,
            plaidItemId: sharedItem.plaidItemId,
        })),
        lastSyncError: undefined,
        lastSyncedAt: undefined,
        status: "active" as const,
        syncCursor: undefined,
        updatedAt: now,
    };
    const linkedAccount = createAccountPlaidSummary(account, link);
    const initialWorkspaceChanges = await writePlaidWorkspaceMutation({
        accountsToPut: [linkedAccount],
        ledgerId,
        linksToPut: [...disabledLinks, link],
        mutationId: `plaid.exchange:${link.plaidAccountLinkId}`,
        mutationType: "plaid.exchange",
        sharedItemsToPut: [sharedItemToStore],
        syncStatesToPut: [initialSyncState],
        workspaceChanges: [
            ...disabledLinks.map((disabledLink) =>
                createWorkspaceUpsertChange({
                    entityId: disabledLink.plaidAccountLinkId,
                    entityType: "plaidAccountLink",
                    previousRecord:
                        existingLinks.find(
                            (existingLink) =>
                                existingLink.plaidAccountLinkId ===
                                disabledLink.plaidAccountLinkId,
                        ) ?? null,
                    record: disabledLink,
                }),
            ),
            createWorkspaceUpsertChange({
                entityId: link.plaidAccountLinkId,
                entityType: "plaidAccountLink",
                previousRecord: null,
                record: link,
            }),
            createWorkspaceUpsertChange({
                entityId: linkedAccount.accountId,
                entityType: "account",
                previousRecord: account,
                record: linkedAccount,
            }),
        ],
    });
    let syncResult:
        | Awaited<ReturnType<typeof syncPlaidAccountLink>>
        | {
                addedCount: number;
                initialSyncError: string;
                initialSyncStatus: "failed";
                modifiedCount: number;
                removedCount: number;
                workspaceChanges: WorkspaceMutationChangeInput[];
            };

    try {
        syncResult = await syncPlaidAccountLink(scope, link.plaidAccountLinkId);
    } catch (error) {
        if (
            !(error instanceof PlaidSyncWorkspaceError) ||
            error.code !== "plaid_sync_failed"
        ) {
            throw error;
        }

        syncResult = {
            addedCount: 0,
            initialSyncError: error.message,
            initialSyncStatus: "failed",
            modifiedCount: 0,
            removedCount: 0,
            workspaceChanges: error.workspaceChanges,
        };
    }
    const workspaceChanges = [
        ...initialWorkspaceChanges,
        ...syncResult.workspaceChanges,
    ];

    return {
        accountId: account.accountId,
        plaidAccountLinkId: link.plaidAccountLinkId,
        ...syncResult,
        workspaceChanges,
    };
}

async function importAddedPlaidTransaction(input: {
    account: Awaited<ReturnType<typeof getAccountRecord>>;
    ledgerId: string;
    link: PlaidAccountLinkRecord;
    now: string;
    plaidTransaction: Transaction;
    transactionLookup: ReturnType<typeof createLedgerTransactionLookup>;
}): Promise<PlaidWorkspaceMutationResult> {
    if (
        !shouldImportPlaidTransactionForLink(input.link, input.plaidTransaction)
    ) {
        return { changed: false, workspaceChanges: [] };
    }

    const existingCandidates = [
        ...(await listPlaidTransactionSyncsForPlaidTransaction(
            input.ledgerId,
            input.link.accountId,
            input.plaidTransaction.transaction_id,
        )),
        ...(input.plaidTransaction.pending_transaction_id
            ? await listPlaidTransactionSyncsForPlaidTransaction(
                    input.ledgerId,
                    input.link.accountId,
                    input.plaidTransaction.pending_transaction_id,
                )
            : []),
    ];
    const existingWithTransaction =
        await findPlaidTransactionSyncWithBudgetedTransaction(
            existingCandidates,
            input.transactionLookup,
        );
    const existing = existingWithTransaction ?? existingCandidates[0];
    const plaidTransactionSyncId =
        existing?.plaidTransactionSyncId ??
        createPlaidSyncId(
            input.ledgerId,
            input.link.accountId,
            input.plaidTransaction.transaction_id,
        );
    const transactionId = existing?.transactionId ?? ulid();
    const record = createPlaidTransactionSyncRecord({
        existing: existing ?? undefined,
        ledgerId: input.ledgerId,
        link: input.link,
        now: input.now,
        plaidTransaction: input.plaidTransaction,
        transactionId,
    });
    const transactionInput = existingWithTransaction
        ? null
        : createPlaidImportedTransactionInput({
                account: input.account,
                link: input.link,
                plaidTransaction: input.plaidTransaction,
                plaidTransactionSyncId,
                transactionId,
            });

    if (transactionInput) {
        const transactionResult = await upsertTransactionWithWorkspaceChanges(
            input.link.ledgerId,
            {
                ...transactionInput,
                allowCreateWithTransactionId: true,
                audit: {
                    action: "importOrSync",
                    source: "plaidSync",
                },
                plaidTransactionSyncRecordsToPut: [record],
            },
        );

        return {
            changed: true,
            workspaceChanges: transactionResult.workspaceChanges,
        };
    }

    const workspaceChanges = await writePlaidWorkspaceMutation({
        ledgerId: input.ledgerId,
        mutationId: `plaid.sync-record:${record.plaidTransactionSyncId}:${record.updatedAt}`,
        mutationType: "plaid.sync-record",
        syncRecordsToPut: [record],
        workspaceChanges: await createPlaidChildWorkspaceChanges({
            existing: existing ?? null,
            record,
            transactionLookup: input.transactionLookup,
        }),
    });

    return {
        changed: false,
        workspaceChanges,
    };
}

async function updateModifiedPlaidTransaction(input: {
    account: Awaited<ReturnType<typeof getAccountRecord>>;
    ledgerId: string;
    link: PlaidAccountLinkRecord;
    now: string;
    plaidTransaction: Transaction;
    transactionLookup: ReturnType<typeof createLedgerTransactionLookup>;
}): Promise<PlaidWorkspaceMutationResult> {
    if (input.plaidTransaction.account_id !== input.link.plaidAccountId) {
        return { changed: false, workspaceChanges: [] };
    }

    const existingRecords = await listPlaidTransactionSyncsForPlaidTransaction(
        input.ledgerId,
        input.link.accountId,
        input.plaidTransaction.transaction_id,
    );

    if (existingRecords.length === 0) {
        return { changed: false, workspaceChanges: [] };
    }

    const updatedRecords = existingRecords.map((existing) =>
        createPlaidTransactionSyncRecord({
            existing,
            ledgerId: input.ledgerId,
            link: input.link,
            now: input.now,
            plaidTransaction: input.plaidTransaction,
            transactionId: existing.transactionId,
        }),
    );

    const transactionResults = await Promise.all(
        updatedRecords.map((record, index) =>
            updateBudgetedTransactionFromModifiedPlaidTransaction({
                account: input.account,
                existingSyncRecord: existingRecords[index]!,
                ledgerId: input.ledgerId,
                link: input.link,
                plaidTransaction: input.plaidTransaction,
                record,
                transactionLookup: input.transactionLookup,
            }),
        ),
    );
    const directRecords = updatedRecords.filter(
        (_, index) => !transactionResults[index]!.transactionWrite,
    );
    const existingRecordById = new Map(
        existingRecords.map((record) => [record.plaidTransactionSyncId, record]),
    );

    const directWorkspaceChanges = directRecords.length
        ? await Promise.all(
                directRecords.map(async (record) =>
                    writePlaidWorkspaceMutation({
                        ledgerId: input.ledgerId,
                        mutationId: `plaid.sync-record:${record.plaidTransactionSyncId}:${record.updatedAt}`,
                        mutationType: "plaid.sync-record",
                        syncRecordsToPut: [record],
                        workspaceChanges: await createPlaidChildWorkspaceChanges({
                            existing:
                                existingRecordById.get(
                                    record.plaidTransactionSyncId,
                                ) ?? null,
                            record,
                            transactionLookup: input.transactionLookup,
                        }),
                    }),
                ),
            )
        : [];

    return {
        changed: true,
        workspaceChanges: [
            ...directWorkspaceChanges.flat(),
            ...transactionResults.flatMap((result) => result.workspaceChanges),
        ],
    };
}

function canRewriteSimplePlaidTransaction(input: {
    lines: Awaited<ReturnType<typeof listTransactionChildren>>["lines"];
    transaction: PlaidBudgetedTransactionRecord;
}) {
    const [line] = input.lines;

    return Boolean(
        input.transaction.source === "plaid" &&
            input.transaction.status !== "voided" &&
            input.lines.length === 1 &&
            line &&
            !(line.fromAccountId && line.toAccountId),
    );
}

async function updateBudgetedTransactionFromModifiedPlaidTransaction(input: {
    account: Awaited<ReturnType<typeof getAccountRecord>>;
    existingSyncRecord: PlaidTransactionSyncRecord;
    ledgerId: string;
    link: PlaidAccountLinkRecord;
    plaidTransaction: Transaction;
    record: PlaidTransactionSyncRecord;
    transactionLookup: ReturnType<typeof createLedgerTransactionLookup>;
}): Promise<{
    transactionWrite: boolean;
    workspaceChanges: WorkspaceMutationChangeInput[];
}> {
    const transaction = await input.transactionLookup.get(
        input.record.transactionId,
    );

    if (!transaction) {
        return { transactionWrite: false, workspaceChanges: [] };
    }

    const children = await listTransactionChildren(
        input.ledgerId,
        transaction.transactionId,
    );

    if (
        !canRewriteSimplePlaidTransaction({
            lines: children.lines,
            transaction,
        })
    ) {
        return { transactionWrite: false, workspaceChanges: [] };
    }

    const existingLine = children.lines[0]!;
    const plaidInput = createPlaidImportedTransactionInput({
        account: input.account,
        link: input.link,
        plaidTransaction: input.plaidTransaction,
        plaidTransactionSyncId: input.record.plaidTransactionSyncId,
        transactionId: input.record.transactionId,
    });
    const plaidLine = plaidInput.lines[0]!;

    if (
        transaction.status === "reconciled" &&
        (existingLine.amountCents !== plaidLine.amountCents ||
            existingLine.fromAccountId !==
                ("fromAccountId" in plaidLine ? plaidLine.fromAccountId : undefined) ||
            existingLine.toAccountId !==
                ("toAccountId" in plaidLine ? plaidLine.toAccountId : undefined))
    ) {
        return { transactionWrite: false, workspaceChanges: [] };
    }

    const result = await upsertTransactionWithWorkspaceChanges(input.ledgerId, {
        accountId: input.account.accountId,
        audit: {
            action: "importOrSync",
            source: "plaidSync",
        },
        kind: "standard",
        lines: [
            {
                ...plaidLine,
                categoryId: existingLine.categoryId,
                lineId: existingLine.lineId,
                memo: existingLine.memo,
                payee: existingLine.payee,
                sortOrder: existingLine.sortOrder,
            },
        ],
        memo: selectPlaidSyncedText({
            current: transaction.memo,
            nextPlaid: plaidInput.memo,
            previousPlaid: input.existingSyncRecord.originalDescription,
        }),
        occurredAt: plaidInput.occurredAt,
        payee: selectPlaidSyncedText({
            current: transaction.payee,
            nextPlaid: plaidInput.payee,
            previousPlaid: input.existingSyncRecord.name,
        }),
        plaidTransactionSyncId: input.record.plaidTransactionSyncId,
        plaidTransactionSyncRecordsToPut: [input.record],
        source: "plaid",
        transactionId: input.record.transactionId,
    });

    return {
        transactionWrite: true,
        workspaceChanges: result.workspaceChanges,
    };
}

function canVoidSimpleRemovedPlaidTransaction(input: {
    lines: Awaited<ReturnType<typeof listTransactionChildren>>["lines"];
    syncRecord: PlaidTransactionSyncRecord;
    transaction: PlaidBudgetedTransactionRecord;
}) {
    const [line] = input.lines;

    return Boolean(
        input.transaction.source === "plaid" &&
            input.transaction.status !== "voided" &&
            input.transaction.status !== "reconciled" &&
            input.lines.length === 1 &&
            line &&
            !line.categoryId &&
            !(line.fromAccountId && line.toAccountId) &&
            normalizeComparableText(input.transaction.payee) ===
                normalizeComparableText(input.syncRecord.name) &&
            normalizeComparableText(input.transaction.memo) ===
                normalizeComparableText(input.syncRecord.originalDescription),
    );
}

async function voidSimpleRemovedPlaidTransaction(input: {
    ledgerId: string;
    record: PlaidTransactionSyncRecord;
    transactionLookup: ReturnType<typeof createLedgerTransactionLookup>;
}): Promise<{
    transactionWrite: boolean;
    workspaceChanges: WorkspaceMutationChangeInput[];
}> {
    const transaction = await input.transactionLookup.get(
        input.record.transactionId,
    );

    if (!transaction) {
        return { transactionWrite: false, workspaceChanges: [] };
    }

    const children = await listTransactionChildren(
        input.ledgerId,
        transaction.transactionId,
    );

    if (
        !canVoidSimpleRemovedPlaidTransaction({
            lines: children.lines,
            syncRecord: input.record,
            transaction,
        })
    ) {
        return { transactionWrite: false, workspaceChanges: [] };
    }

    const result = await voidTransactionWithWorkspaceChanges(
        input.ledgerId,
        transaction.transactionId,
        {
            action: "void",
            source: "plaidSync",
        },
        undefined,
        [input.record],
    );

    return {
        transactionWrite: true,
        workspaceChanges: result.workspaceChanges,
    };
}

async function markRemovedPlaidTransaction(input: {
    ledgerId: string;
    link: PlaidAccountLinkRecord;
    now: string;
    removedTransaction: RemovedTransaction;
    transactionLookup: ReturnType<typeof createLedgerTransactionLookup>;
}): Promise<PlaidWorkspaceMutationResult> {
    if (input.removedTransaction.account_id !== input.link.plaidAccountId) {
        return { changed: false, workspaceChanges: [] };
    }

    const existingRecords = await listPlaidTransactionSyncsForPlaidTransaction(
        input.ledgerId,
        input.link.accountId,
        input.removedTransaction.transaction_id,
    );

    if (existingRecords.length === 0) {
        return { changed: false, workspaceChanges: [] };
    }

    const removedRecords = existingRecords.map((existing) => ({
        ...existing,
        lastSyncedAt: input.now,
        removedAt: input.now,
        status: "removed" as const,
        updatedAt: input.now,
    }));

    const transactionResults = await Promise.all(
        removedRecords.map((record) =>
            voidSimpleRemovedPlaidTransaction({
                ledgerId: input.ledgerId,
                record,
                transactionLookup: input.transactionLookup,
            }),
        ),
    );
    const directRecords = removedRecords.filter(
        (_, index) => !transactionResults[index]!.transactionWrite,
    );
    const existingRecordById = new Map(
        existingRecords.map((record) => [record.plaidTransactionSyncId, record]),
    );

    const directWorkspaceChanges = directRecords.length
        ? await Promise.all(
                directRecords.map(async (record) =>
                    writePlaidWorkspaceMutation({
                        ledgerId: input.ledgerId,
                        mutationId: `plaid.sync-record:${record.plaidTransactionSyncId}:${record.updatedAt}`,
                        mutationType: "plaid.sync-record",
                        syncRecordsToPut: [record],
                        workspaceChanges: await createPlaidChildWorkspaceChanges({
                            existing:
                                existingRecordById.get(
                                    record.plaidTransactionSyncId,
                                ) ?? null,
                            record,
                            transactionLookup: input.transactionLookup,
                        }),
                    }),
                ),
            )
        : [];

    return {
        changed: true,
        workspaceChanges: [
            ...directWorkspaceChanges.flat(),
            ...transactionResults.flatMap((result) => result.workspaceChanges),
        ],
    };
}

export async function syncPlaidAccountBalance(
    scope: PlaidLedgerScope,
    accountId: string,
) {
    const ledgerId = scope.ledgerId;
    const account = await getAccountRecord(ledgerId, accountId);

    assertAccountSupportsPlaid(account);
    const link = await getActivePlaidLinkForAccount(ledgerId, accountId);

    if (!link) {
        throw new HttpError(
            404,
            "plaid_link_missing",
            "This account is not linked to Plaid.",
        );
    }

    const sharedItem = await getRequiredSharedPlaidItem(link.plaidItemId);

    try {
        const response = await getPlaidClient().accountsBalanceGet({
            access_token: sharedItem.accessToken,
            options: {
                account_ids: [link.plaidAccountId],
            },
        });
        const plaidAccount = response.data.accounts.find(
            (candidate) => candidate.account_id === link.plaidAccountId,
        );

        if (!plaidAccount) {
            throw new HttpError(
                502,
                "plaid_balance_account_missing",
                "Plaid did not return a balance for this linked account.",
            );
        }

        const now = new Date().toISOString();
        const syncedLink = {
            ...link,
            plaidBalanceAvailableCents: toOptionalCents(
                plaidAccount.balances.available,
            ),
            plaidBalanceCurrentCents: toOptionalCents(plaidAccount.balances.current),
            plaidBalanceIsoCurrencyCode: optionalString(
                plaidAccount.balances.iso_currency_code,
            ),
            plaidBalanceLastSyncedAt: now,
            plaidBalanceLimitCents: toOptionalCents(plaidAccount.balances.limit),
            plaidBalanceSyncError: undefined,
            plaidBalanceSyncStatus: "succeeded" as const,
            plaidBalanceUnofficialCurrencyCode: optionalString(
                plaidAccount.balances.unofficial_currency_code,
            ),
            updatedAt: now,
        };

        const syncedAccount = createAccountPlaidSummary(account, syncedLink);
        const workspaceChanges = await writePlaidWorkspaceMutation({
            accountsToPut: [syncedAccount],
            ledgerId,
            linksToPut: [syncedLink],
            mutationId: `plaid.balance:${syncedLink.plaidAccountLinkId}:${syncedLink.updatedAt}`,
            mutationType: "plaid.balance",
            workspaceChanges: [
                createWorkspaceUpsertChange({
                    entityId: syncedAccount.accountId,
                    entityType: "account",
                    previousRecord: account,
                    record: syncedAccount,
                }),
                createWorkspaceUpsertChange({
                    entityId: syncedLink.plaidAccountLinkId,
                    entityType: "plaidAccountLink",
                    previousRecord: link,
                    record: syncedLink,
                }),
            ],
        });

        return {
            accountId,
            plaidAccountLinkId: link.plaidAccountLinkId,
            plaidBalanceAvailableCents: syncedLink.plaidBalanceAvailableCents,
            plaidBalanceCurrentCents: syncedLink.plaidBalanceCurrentCents,
            plaidBalanceIsoCurrencyCode: syncedLink.plaidBalanceIsoCurrencyCode,
            plaidBalanceLastSyncedAt: syncedLink.plaidBalanceLastSyncedAt,
            plaidBalanceLimitCents: syncedLink.plaidBalanceLimitCents,
            plaidBalanceSyncStatus: syncedLink.plaidBalanceSyncStatus,
            plaidBalanceUnofficialCurrencyCode:
                syncedLink.plaidBalanceUnofficialCurrencyCode,
            workspaceChanges,
        };
    } catch (error) {
        const balanceError = toPlaidBalanceHttpError(error);

        await markPlaidBalanceSyncFailed({
            account,
            error: balanceError,
            link,
        });
        throw balanceError;
    }
}

export async function syncPlaidAccountBalanceWithWorkspaceChanges(
    scope: PlaidLedgerScope,
    accountId: string,
) {
    return syncPlaidAccountBalance(scope, accountId);
}

export async function syncPlaidAccount(
    scope: PlaidLedgerScope,
    accountId: string,
    input: PlaidSyncRequest = {},
) {
    const ledgerId = scope.ledgerId;
    const account = await getAccountRecord(ledgerId, accountId);

    assertAccountSupportsPlaid(account);
    const link = await getActivePlaidLinkForAccount(ledgerId, accountId);

    if (!link) {
        throw new HttpError(
            404,
            "plaid_link_missing",
            "This account is not linked to Plaid.",
        );
    }

    if (input.syncStartDate && input.syncStartDate !== link.syncStartDate) {
        await updatePlaidLinkSyncStartDate({
            account,
            link,
            syncStartDate: input.syncStartDate,
        });
    }

    return syncPlaidAccountLink(scope, link.plaidAccountLinkId);
}

export async function unlinkPlaidAccountWithWorkspaceChanges(
    scope: PlaidLedgerScope,
    accountId: string,
) {
    const ledgerId = scope.ledgerId;
    const link = await getActivePlaidLinkForAccount(ledgerId, accountId);

    if (!link) {
        throw new HttpError(
            404,
            "plaid_link_missing",
            "This account is not linked to Plaid.",
        );
    }

    const account = await getAccountRecord(ledgerId, accountId);
    const now = new Date().toISOString();
    const disabledLink: PlaidAccountLinkRecord = {
        ...link,
        status: "disabled",
        updatedAt: now,
    };
    const clearedAccount = clearAccountPlaidSummary(account, now);

    const workspaceChanges = await writePlaidWorkspaceMutation({
        accountsToPut: [clearedAccount],
        ledgerId,
        linksToPut: [disabledLink],
        mutationId: `plaid.unlink:${disabledLink.plaidAccountLinkId}:${now}`,
        mutationType: "plaid.unlink",
        workspaceChanges: [
            createWorkspaceUpsertChange({
                entityId: disabledLink.plaidAccountLinkId,
                entityType: "plaidAccountLink",
                previousRecord: link,
                record: disabledLink,
            }),
            createWorkspaceUpsertChange({
                entityId: clearedAccount.accountId,
                entityType: "account",
                previousRecord: account,
                record: clearedAccount,
            }),
        ],
    });

    return {
        account: clearedAccount,
        plaidAccountLinkId: disabledLink.plaidAccountLinkId,
        workspaceChanges,
    };
}

async function fetchPlaidTransactionSyncUpdates(input: {
    accessToken: string;
    client: ReturnType<typeof getPlaidClient>;
    initialCursor: string | undefined;
}): Promise<PlaidTransactionSyncUpdates> {
    let restartCount = 0;

    while (true) {
        let cursor = input.initialCursor;
        let hasMore = true;
        const updates: PlaidTransactionSyncUpdates = {
            added: [],
            cursor,
            modified: [],
            removed: [],
        };

        try {
            while (hasMore) {
                const response = await input.client.transactionsSync({
                    access_token: input.accessToken,
                    cursor,
                    options: cursor
                        ? undefined
                        : {
                                include_original_description: true,
                            },
                });

                updates.added.push(...response.data.added);
                updates.modified.push(...response.data.modified);
                updates.removed.push(...response.data.removed);

                cursor = response.data.next_cursor || cursor;
                updates.cursor = cursor;
                hasMore = response.data.has_more;
            }

            return updates;
        } catch (error) {
            if (
                !isPlaidSyncMutationDuringPagination(error) ||
                restartCount >= MAX_PLAID_SYNC_PAGINATION_RESTARTS
            ) {
                throw error;
            }

            restartCount += 1;
        }
    }
}

export async function syncPlaidAccountLink(
    scope: PlaidLedgerScope,
    plaidAccountLinkId: string,
) {
    const ledgerId = scope.ledgerId;
    const { entities } = getBudgetedSchema();
    const linkResult = await entities.plaidAccountLinks
        .get({ ledgerId, plaidAccountLinkId })
        .go();
    const requestedLink = linkResult.data as PlaidAccountLinkRecord | undefined;

    if (!requestedLink || requestedLink.status === "disabled") {
        throw new HttpError(
            404,
            "plaid_link_missing",
            "The Plaid account link could not be found.",
        );
    }

    const activeLinks = includeRequestedPlaidLink({
        links: await listActivePlaidLinksForItem(
            ledgerId,
            requestedLink.plaidItemId,
        ),
        requestedLink,
    });
    const linksByPlaidAccountId = indexPlaidLinksByPlaidAccountId(activeLinks);
    const accountPairs = await Promise.all(
        activeLinks.map(
            async (link) =>
                [
                    link.plaidAccountLinkId,
                    await getAccountRecord(ledgerId, link.accountId),
                ] as const,
        ),
    );
    const accountsByLinkId = new Map(accountPairs);
    const unsupportedLinkedAccount = accountPairs.find(
        ([, account]) => !accountTypeSupportsPlaid(account.accountType),
    );

    if (unsupportedLinkedAccount) {
        throw new HttpError(
            422,
            "plaid_account_type_unsupported",
            "Transfers accounts cannot be linked to Plaid or synced with Plaid.",
        );
    }

    const sharedItem = await getRequiredSharedPlaidItem(
        requestedLink.plaidItemId,
    );
    const syncState = await getOrCreatePlaidItemSyncState({
        ledgerId,
        plaidItemId: requestedLink.plaidItemId,
    });
    const transactionLookup = createLedgerTransactionLookup(ledgerId);
    const client = getPlaidClient();

    try {
        const updates = await fetchPlaidTransactionSyncUpdates({
            accessToken: sharedItem.accessToken,
            client,
            initialCursor: syncState.syncCursor,
        });
        const now = new Date().toISOString();
        let addedCount = 0;
        let modifiedCount = 0;
        let removedCount = 0;
        const workspaceChanges: WorkspaceMutationChangeInput[] = [];

        for (const transaction of updates.added) {
            const link = linksByPlaidAccountId.get(transaction.account_id);
            const account = link
                ? accountsByLinkId.get(link.plaidAccountLinkId)
                : undefined;

            if (!link || !account) {
                continue;
            }

            const imported = await importAddedPlaidTransaction({
                account,
                ledgerId: scope.ledgerId,
                link,
                now,
                plaidTransaction: transaction,
                transactionLookup,
            });

            workspaceChanges.push(...imported.workspaceChanges);

            if (imported.changed) {
                addedCount += 1;
            }
        }

        for (const transaction of updates.modified) {
            const link = linksByPlaidAccountId.get(transaction.account_id);
            const account = link
                ? accountsByLinkId.get(link.plaidAccountLinkId)
                : undefined;

            if (!link || !account) {
                continue;
            }

            const modified = await updateModifiedPlaidTransaction({
                account,
                ledgerId: scope.ledgerId,
                link,
                now,
                plaidTransaction: transaction,
                transactionLookup,
            });

            workspaceChanges.push(...modified.workspaceChanges);

            if (modified.changed) {
                modifiedCount += 1;
            }
        }

        for (const removedTransaction of updates.removed) {
            const link = linksByPlaidAccountId.get(removedTransaction.account_id);

            if (!link) {
                continue;
            }

            const removed = await markRemovedPlaidTransaction({
                ledgerId: scope.ledgerId,
                link,
                now,
                removedTransaction,
                transactionLookup,
            });

            workspaceChanges.push(...removed.workspaceChanges);

            if (removed.changed) {
                removedCount += 1;
            }
        }

        const syncedAt = new Date().toISOString();
        const updatedLinks = activeLinks.map((link) => ({
            ...link,
            lastSyncError: undefined,
            lastSyncStatus: "succeeded" as const,
            lastSyncedAt: syncedAt,
            status: "linked" as const,
            updatedAt: syncedAt,
        }));

        const updatedSharedItem: PlaidSharedItemRecord = {
            ...sharedItem,
            lastSyncError: undefined,
            status: "active",
            updatedAt: syncedAt,
        };
        const updatedSyncState: PlaidItemSyncStateRecord = {
            ...syncState,
            lastSyncError: undefined,
            lastSyncedAt: syncedAt,
            status: "active",
            syncCursor: updates.cursor,
            updatedAt: syncedAt,
        };

        for (const [index, link] of updatedLinks.entries()) {
            const account = accountsByLinkId.get(link.plaidAccountLinkId);

            if (!account) {
                continue;
            }

            const updatedAccount = createAccountPlaidSummary(account, link);
            const statusChanges = await writePlaidWorkspaceMutation({
                accountsToPut: [updatedAccount],
                ledgerId,
                linksToPut: [link],
                mutationId: `plaid.sync-status:${link.plaidAccountLinkId}:${syncedAt}`,
                mutationType: "plaid.sync-status",
                sharedItemsToPut: index === 0 ? [updatedSharedItem] : [],
                syncStatesToPut: index === 0 ? [updatedSyncState] : [],
                workspaceChanges: [
                    createWorkspaceUpsertChange({
                        entityId: link.plaidAccountLinkId,
                        entityType: "plaidAccountLink",
                        previousRecord: activeLinks[index] ?? null,
                        record: link,
                    }),
                    createWorkspaceUpsertChange({
                        entityId: updatedAccount.accountId,
                        entityType: "account",
                        previousRecord: account,
                        record: updatedAccount,
                    }),
                ],
            });

            workspaceChanges.push(...statusChanges);
        }

        try {
            const { reconcileVenmoActivities } = await import(
                "@/features/venmo/server/venmo-service"
            );
            const venmoReconciliation = await reconcileVenmoActivities(ledgerId);
            const persistedVenmoChanges = await persistWorkspaceChanges({
                activeLedgerId: ledgerId,
                changes: venmoReconciliation.workspaceChanges,
            });
            workspaceChanges.push(...persistedVenmoChanges);
        } catch (error) {
            console.error(
                "Plaid sync completed, but Venmo activity reconciliation failed.",
                error,
            );
        }

        return {
            addedCount,
            modifiedCount,
            removedCount,
            syncedAt,
            workspaceChanges,
        };
    } catch (error) {
        const syncError = toPlaidSyncHttpError(error);

        const failedAt = new Date().toISOString();
        const message =
            syncError instanceof Error
                ? syncError.message
                : "Unable to sync Plaid transactions.";
        const failedSharedItem: PlaidSharedItemRecord = {
            ...sharedItem,
            lastSyncError: message,
            status: "error",
            updatedAt: failedAt,
        };
        const failedSyncState: PlaidItemSyncStateRecord = {
            ...syncState,
            lastSyncError: message,
            status: "error",
            updatedAt: failedAt,
        };

        const statusChanges = await Promise.all(
            activeLinks.map(async (link, index) => {
                const account = accountsByLinkId.get(link.plaidAccountLinkId);

                if (!account) {
                    return [];
                }

                const failedLink: PlaidAccountLinkRecord = {
                    ...link,
                    lastSyncError: message,
                    lastSyncStatus: "failed",
                    status: "error",
                    updatedAt: failedAt,
                };
                const failedAccount = createAccountPlaidSummary(account, failedLink);

                return writePlaidWorkspaceMutation({
                    accountsToPut: [failedAccount],
                    ledgerId,
                    linksToPut: [failedLink],
                    mutationId: `plaid.sync-status:${failedLink.plaidAccountLinkId}:${failedAt}`,
                    mutationType: "plaid.sync-status",
                    sharedItemsToPut: index === 0 ? [failedSharedItem] : [],
                    syncStatesToPut: index === 0 ? [failedSyncState] : [],
                    workspaceChanges: [
                        createWorkspaceUpsertChange({
                            entityId: failedLink.plaidAccountLinkId,
                            entityType: "plaidAccountLink",
                            previousRecord: link,
                            record: failedLink,
                        }),
                        createWorkspaceUpsertChange({
                            entityId: failedAccount.accountId,
                            entityType: "account",
                            previousRecord: account,
                            record: failedAccount,
                        }),
                    ],
                });
            }),
        );
        throw new PlaidSyncWorkspaceError(syncError, statusChanges.flat());
    }
}
