import { ulid } from "ulid";

import type {
    TransactionTemplateInput,
    TransactionTemplateLineInput,
} from "@/features/transaction-templates/models/transaction-template";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";
import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";
import { normalizeOptionalString } from "@/lib/strings";
import type {
    WorkspaceAccountRecord,
    WorkspaceBudgetCategoryRecord,
    WorkspaceTransactionTemplateRecord,
} from "@/lib/workspace/sync-types";
import { isUserVisibleBudgetCategory } from "@/modules/budgeting";

function normalizeTemplateLines(lines: TransactionTemplateLineInput[]) {
    const seenLineIds = new Set<string>();

    return [...lines]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((line, index) => {
            const lineId = line.lineId?.trim() || ulid();

            if (seenLineIds.has(lineId)) {
                throw new HttpError(
                    422,
                    "duplicate_template_line",
                    "Template split line ids must be unique.",
                );
            }

            seenLineIds.add(lineId);

            return {
                categoryId: line.categoryId,
                formula: line.formula,
                lineId,
                sortOrder: index,
            };
        });
}

async function listTemplateValidationRecords(ledgerId: string) {
    const { entities } = getBudgetedSchema();
    const [accounts, categories] = await Promise.all([
        queryAllPages(entities.accounts.query.byAccount({ ledgerId }), {
            consistent: true,
        }),
        queryAllPages(entities.budgetCategories.query.byCategory({ ledgerId }), {
            consistent: true,
        }),
    ]);

    return {
        accountIds: new Set(
            (accounts as WorkspaceAccountRecord[]).map(
                (account) => account.accountId,
            ),
        ),
        categoryIds: new Set(
            (categories as WorkspaceBudgetCategoryRecord[])
                .filter(
                    (category) =>
                        category.status === "active" &&
                        isUserVisibleBudgetCategory(category),
                )
                .map((category) => category.categoryId),
        ),
    };
}

async function validateTemplateReferences(input: {
    accountId?: string;
    categoryIds: string[];
    ledgerId: string;
}) {
    const { accountIds, categoryIds } = await listTemplateValidationRecords(
        input.ledgerId,
    );

    if (input.accountId && !accountIds.has(input.accountId)) {
        throw new HttpError(
            404,
            "account_missing",
            "The default account for this template could not be found.",
        );
    }

    for (const categoryId of input.categoryIds) {
        if (!categoryIds.has(categoryId)) {
            throw new HttpError(
                404,
                "category_missing",
                "One or more template split categories were not found.",
            );
        }
    }
}

function toTemplateRecord(input: {
    existing?: WorkspaceTransactionTemplateRecord;
    ledgerId: string;
    payload: TransactionTemplateInput;
    templateId: string;
}) {
    const now = new Date().toISOString();
    const lines = normalizeTemplateLines(input.payload.lines);

    return {
        accountId: normalizeOptionalString(input.payload.accountId ?? undefined),
        createdAt: input.existing?.createdAt ?? now,
        defaultAmountCents:
            input.payload.defaultAmountCents === null
                ? undefined
                : (input.payload.defaultAmountCents ?? undefined),
        ledgerId: input.ledgerId,
        linesJson: JSON.stringify(lines),
        memo: normalizeOptionalString(input.payload.memo ?? undefined),
        name: input.payload.name.trim(),
        payee: normalizeOptionalString(input.payload.payee ?? undefined),
        templateId: input.templateId,
        updatedAt: now,
    } satisfies WorkspaceTransactionTemplateRecord;
}

export async function listTransactionTemplates(ledgerId: string) {
    const { entities } = getBudgetedSchema();
    const templates = await queryAllPages(
        entities.transactionTemplates.query.byTemplate({ ledgerId }),
        { consistent: true },
    );

    return (templates as WorkspaceTransactionTemplateRecord[]).sort(
        (left, right) =>
            left.name.localeCompare(right.name) ||
            left.templateId.localeCompare(right.templateId),
    );
}

export async function createTransactionTemplate(
    ledgerId: string,
    input: TransactionTemplateInput,
) {
    const { entities } = getBudgetedSchema();
    const templateId = ulid();
    const record = toTemplateRecord({
        ledgerId,
        payload: input,
        templateId,
    });

    await validateTemplateReferences({
        accountId: record.accountId,
        categoryIds: JSON.parse(record.linesJson).map(
            (line: { categoryId: string }) => line.categoryId,
        ),
        ledgerId,
    });
    await entities.transactionTemplates.put(record).go();

    return record;
}

function createTemplateUpsertChange(
    record: WorkspaceTransactionTemplateRecord,
    previousRecord?: WorkspaceTransactionTemplateRecord,
): WorkspaceMutationChangeInput {
    return {
        entityId: record.templateId,
        entityType: "transactionTemplate",
        operation: "upsert",
        previousRecordDigest: previousRecord
            ? calculateWorkspaceRecordDigest({
                  entityType: "transactionTemplate",
                  record: previousRecord,
              })
            : null,
        record,
    };
}

function createTemplateDeleteChange(
    templateId: string,
    previousRecord: WorkspaceTransactionTemplateRecord,
): WorkspaceMutationChangeInput {
    return {
        entityId: templateId,
        entityType: "transactionTemplate",
        operation: "delete",
        previousRecordDigest: calculateWorkspaceRecordDigest({
            entityType: "transactionTemplate",
            record: previousRecord,
        }),
        record: null,
    };
}

export async function createTransactionTemplateWithWorkspaceChanges(
    ledgerId: string,
    input: TransactionTemplateInput,
) {
    const template = await createTransactionTemplate(ledgerId, input);

    return {
        template,
        workspaceChanges: [createTemplateUpsertChange(template)],
    };
}

async function getTransactionTemplateRecord(
    ledgerId: string,
    templateId: string,
) {
    const { entities } = getBudgetedSchema();
    const result = await entities.transactionTemplates
        .get({ ledgerId, templateId })
        .go();

    const record = result.data as WorkspaceTransactionTemplateRecord | null;

    if (!record) {
        throw new HttpError(
            404,
            "transaction_template_missing",
            "The transaction template could not be found.",
        );
    }

    return record;
}

export async function updateTransactionTemplate(
    ledgerId: string,
    templateId: string,
    input: TransactionTemplateInput,
) {
    const { entities } = getBudgetedSchema();
    const existing = await getTransactionTemplateRecord(ledgerId, templateId);
    const record = toTemplateRecord({
        existing,
        ledgerId,
        payload: input,
        templateId,
    });

    await validateTemplateReferences({
        accountId: record.accountId,
        categoryIds: JSON.parse(record.linesJson).map(
            (line: { categoryId: string }) => line.categoryId,
        ),
        ledgerId,
    });
    await entities.transactionTemplates.put(record).go();

    return record;
}

export async function updateTransactionTemplateWithWorkspaceChanges(
    ledgerId: string,
    templateId: string,
    input: TransactionTemplateInput,
) {
    const existing = await getTransactionTemplateRecord(ledgerId, templateId);
    const template = await updateTransactionTemplate(ledgerId, templateId, input);

    return {
        template,
        workspaceChanges: [createTemplateUpsertChange(template, existing)],
    };
}

export async function deleteTransactionTemplate(
    ledgerId: string,
    templateId: string,
) {
    await getTransactionTemplateRecord(ledgerId, templateId);

    const { entities } = getBudgetedSchema();
    await entities.transactionTemplates.delete({ ledgerId, templateId }).go();
}

export async function deleteTransactionTemplateWithWorkspaceChanges(
    ledgerId: string,
    templateId: string,
) {
    const existing = await getTransactionTemplateRecord(ledgerId, templateId);
    await deleteTransactionTemplate(ledgerId, templateId);

    return {
        workspaceChanges: [createTemplateDeleteChange(templateId, existing)],
    };
}
