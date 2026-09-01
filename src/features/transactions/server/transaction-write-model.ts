import type { PlaidTransactionSyncRecord } from "@/features/plaid/server/plaid-service";
import { createTransactionAggregateMetadata } from "@/features/transactions/models/transaction-aggregate-revision";
import { toVisibleReferenceCategoryId } from "@/features/transactions/models/reference-category";
import type { TransactionLineInput } from "@/features/transactions/models/transaction-form";
import {
    hasTransactionLineAccount,
    isOneSidedAccountTransactionLine,
    isTransferTransactionLine,
} from "@/features/transactions/models/transaction-shape";
import type { PersistedPosting } from "@/features/transactions/server/posting-service";
import type { PersistedTransactionLine } from "@/features/transactions/server/transaction-line-service";
import type { TransactionChildRecords } from "@/features/transactions/server/transaction-child-service";
import type { TransactionReferenceRecords } from "@/features/transactions/server/transaction-reference-service";
import { HttpError } from "@/lib/api/errors";
import { normalizeOptionalString } from "@/lib/strings";
import { UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID } from "@/modules/budgeting/uncategorized";
import {
    assertValidTransactionPostings,
    buildTransactionLinePostingInputs,
    deriveTransactionDisplayAmountCents,
    groupTransactionPostingInputs,
} from "@/modules/ledger";
import { inferTransactionReferenceCategoryId } from "@/features/transactions/models/reference-category";
import type { WorkspaceTransactionImportActivityRecord } from "@/lib/workspace/sync-types";

export type TransactionRecord = {
    aggregateLineCount?: number;
    aggregateLineDigest?: string;
    aggregatePlaidSyncCount?: number;
    aggregatePlaidSyncDigest?: string;
    aggregatePostingCount?: number;
    aggregatePostingDigest?: string;
    aggregateRevision?: string;
    displayAmountCents: number;
    enteredAt: string;
    kind: "adjustment" | "standard";
    ledgerId: string;
    memo?: string;
    occurredAt: string;
    payee?: string;
    periodId: string;
    plaidTransactionSyncId?: string;
    referenceAccountId: string;
    referenceCategoryId?: string;
    source?: "manual" | "plaid" | "venmo";
    status: "entered" | "cleared" | "reconciled" | "voided";
    transactionId: string;
    updatedAt: string;
};

export type TransactionWithPostings = TransactionRecord & {
    importActivities?: WorkspaceTransactionImportActivityRecord[];
    lines: PersistedTransactionLine[];
    postings: PersistedPosting[];
};

export type TransactionWriteState = {
    existing?: TransactionRecord | null;
    existingChildren: {
        lines: PersistedTransactionLine[];
        postings: PersistedPosting[];
    };
    expectedTransactionUpdatedAt?: string;
    lineRecords: PersistedTransactionLine[];
    postingRecords: PersistedPosting[];
    record: TransactionRecord;
};

export type TransactionDeletionState = {
    children: TransactionChildRecords;
    plaidTransactionSyncRecords: PlaidTransactionSyncRecord[];
    transaction: TransactionRecord;
};

export function attachTransactionAggregateMetadata(input: {
    ledgerPostings: PersistedPosting[];
    plaidTransactionSyncs?: PlaidTransactionSyncRecord[];
    record: TransactionRecord;
    transactionLines: PersistedTransactionLine[];
}) {
    const plaidTransactionSyncs =
        input.plaidTransactionSyncs ??
        (input.record.plaidTransactionSyncId
            ? [
                  {
                      plaidTransactionSyncId:
                          input.record.plaidTransactionSyncId,
                  },
              ]
            : []);

    Object.assign(
        input.record,
        createTransactionAggregateMetadata({
            ledgerPostings: input.ledgerPostings,
            plaidTransactionSyncs,
            transaction: input.record,
            transactionLines: input.transactionLines,
        }),
    );
}

export function toPublicTransactionRecord<
    TTransaction extends TransactionRecord,
>(transaction: TTransaction): TransactionRecord {
    return {
        ...transaction,
        source: transaction.source ?? "manual",
        referenceCategoryId: toVisibleReferenceCategoryId(
            transaction.referenceCategoryId,
        ),
    };
}

function assertLineAccountShape(input: {
    kind: TransactionRecord["kind"];
    line: TransactionLineInput;
}) {
    if (
        !Number.isInteger(input.line.amountCents) ||
        input.line.amountCents <= 0
    ) {
        throw new HttpError(
            422,
            "line_validation_error",
            "Transaction line amounts must be positive cents values.",
        );
    }

    const hasCategory = Boolean(input.line.categoryId);

    if (input.kind === "adjustment") {
        if (hasCategory || !isOneSidedAccountTransactionLine(input.line)) {
            throw new HttpError(
                422,
                "line_validation_error",
                "Adjustment lines require exactly one account and no category.",
            );
        }

        return;
    }

    if (hasCategory && isTransferTransactionLine(input.line)) {
        throw new HttpError(
            422,
            "line_validation_error",
            "A transaction line cannot be both a transfer and category assignment.",
        );
    }

    if (!hasTransactionLineAccount(input.line)) {
        throw new HttpError(
            422,
            "line_validation_error",
            "Transaction lines require at least one account.",
        );
    }

    if (
        isTransferTransactionLine(input.line) &&
        input.line.fromAccountId === input.line.toAccountId
    ) {
        throw new HttpError(
            422,
            "line_validation_error",
            "Transfer lines require two different accounts.",
        );
    }
}

export async function resolveTransactionWriteModel(input: {
    accountId?: string;
    kind: TransactionRecord["kind"];
    lines: TransactionLineInput[];
    ledgerId: string;
    references: TransactionReferenceRecords;
}) {
    const normalizedLines = input.lines.map((line, index) => {
        assertLineAccountShape({ kind: input.kind, line });

        if (
            line.fromAccountId &&
            !input.references.accountById.has(line.fromAccountId)
        ) {
            throw new HttpError(
                404,
                "account_missing",
                "One or more transaction lines reference a missing from account.",
            );
        }

        if (
            line.toAccountId &&
            !input.references.accountById.has(line.toAccountId)
        ) {
            throw new HttpError(
                404,
                "account_missing",
                "One or more transaction lines reference a missing to account.",
            );
        }

        if (
            line.categoryId &&
            !input.references.categoryById.has(line.categoryId)
        ) {
            throw new HttpError(
                404,
                "category_missing",
                "One or more transaction lines reference a missing category.",
            );
        }

        return {
            ...line,
            categoryId: normalizeOptionalString(line.categoryId),
            fromAccountId: normalizeOptionalString(line.fromAccountId),
            memo: normalizeOptionalString(line.memo),
            payee: normalizeOptionalString(line.payee),
            sortOrder: line.sortOrder ?? index,
            toAccountId: normalizeOptionalString(line.toAccountId),
        };
    });
    const referenceAccountId =
        normalizeOptionalString(input.accountId) ??
        normalizedLines.find((line) => line.fromAccountId)?.fromAccountId ??
        normalizedLines.find((line) => line.toAccountId)?.toAccountId;
    const referenceAccount = referenceAccountId
        ? input.references.accountById.get(referenceAccountId)
        : undefined;

    if (!referenceAccount) {
        throw new HttpError(
            422,
            "reference_account_required",
            "Transactions require a reference account.",
        );
    }

    const postings = groupTransactionPostingInputs(
        normalizedLines.flatMap((line) => {
            const fromAccount = line.fromAccountId
                ? input.references.accountById.get(line.fromAccountId)
                : undefined;
            const toAccount = line.toAccountId
                ? input.references.accountById.get(line.toAccountId)
                : undefined;
            const category = line.categoryId
                ? input.references.categoryById.get(line.categoryId)
                : undefined;

            return buildTransactionLinePostingInputs({
                amountCents: line.amountCents,
                categoryLedgerAccountId: category?.ledgerAccountId,
                fromLedgerAccountId: fromAccount?.ledgerAccountId,
                toLedgerAccountId: toAccount?.ledgerAccountId,
                uncategorizedEquityLedgerAccountId:
                    UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID,
            });
        }),
    );
    const displayAmountCents = deriveTransactionDisplayAmountCents({
        ledgerAccountId: referenceAccount.ledgerAccountId,
        postings,
    });

    assertValidTransactionPostings({ postings });

    for (const posting of postings) {
        if (
            posting.ledgerAccountKind === "financial" &&
            !input.references.accountIdByLedgerAccountId.has(
                posting.ledgerAccountId,
            )
        ) {
            throw new HttpError(
                404,
                "account_missing",
                "One or more transaction postings reference a missing account.",
            );
        }

        if (
            posting.ledgerAccountKind === "category" &&
            !input.references.categoryIdByLedgerAccountId.has(
                posting.ledgerAccountId,
            )
        ) {
            throw new HttpError(
                404,
                "category_missing",
                "One or more transaction postings reference a missing category.",
            );
        }
    }

    return {
        displayAmountCents,
        lines: normalizedLines,
        postings,
        referenceAccountId: referenceAccount.accountId,
        referenceCategoryId: inferTransactionReferenceCategoryId({
            displayAmountCents,
            kind: input.kind,
            lines: normalizedLines,
        }),
    };
}
