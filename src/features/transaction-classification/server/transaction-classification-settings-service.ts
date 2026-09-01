import type {
    TransactionClassificationModelOption,
    TransactionClassificationSettingsInput,
} from "@/features/transaction-classification/models/transaction-classification";
import {
    assertTransactionClassificationModelAvailable,
    listAvailableTransactionClassificationModels,
    resolveAvailableTransactionClassificationModelId,
} from "@/features/transaction-classification/server/transaction-classification-models";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { normalizeOptionalString } from "@/lib/strings";

const SETTINGS_ID = "default";

export type TransactionClassificationSettingsRecord = {
    createdAt: string;
    ledgerId: string;
    modelId?: string;
    settingsId: string;
    systemInstructions?: string;
    updatedAt: string;
};

export type TransactionClassificationSettings = {
    availableModels: TransactionClassificationModelOption[];
    modelId: string | null;
    systemInstructions: string;
};

function toPublicSettings(
    record: TransactionClassificationSettingsRecord | null,
): TransactionClassificationSettings {
    const availableModels = listAvailableTransactionClassificationModels();

    if (!record) {
        return {
            availableModels,
            modelId: resolveAvailableTransactionClassificationModelId(),
            systemInstructions: "",
        };
    }

    return {
        availableModels,
        modelId: resolveAvailableTransactionClassificationModelId(record.modelId),
        systemInstructions: record.systemInstructions ?? "",
    };
}

async function getSettingsRecord(ledgerId: string) {
    const { entities } = getBudgetedSchema();
    const result = await entities.transactionClassificationSettings
        .get({ ledgerId, settingsId: SETTINGS_ID })
        .go();

    return (result.data as TransactionClassificationSettingsRecord | null) ?? null;
}

export async function getTransactionClassificationSettings(ledgerId: string) {
    return toPublicSettings(await getSettingsRecord(ledgerId));
}

export async function updateTransactionClassificationSettings(
    ledgerId: string,
    input: TransactionClassificationSettingsInput,
) {
    const { entities } = getBudgetedSchema();
    const existing = await getSettingsRecord(ledgerId);
    const now = new Date().toISOString();
    const selectedModelId =
        normalizeOptionalString(input.modelId) ??
        resolveAvailableTransactionClassificationModelId(existing?.modelId);

    if (selectedModelId) {
        assertTransactionClassificationModelAvailable(selectedModelId);
    }

    const record = {
        createdAt: existing?.createdAt ?? now,
        ledgerId,
        ...(selectedModelId ? { modelId: selectedModelId } : {}),
        settingsId: SETTINGS_ID,
        systemInstructions: normalizeOptionalString(input.systemInstructions),
        updatedAt: now,
    } satisfies TransactionClassificationSettingsRecord;

    await entities.transactionClassificationSettings.put(record).go();

    return toPublicSettings(record);
}

export async function listTransactionClassificationSettingsRecords(
    ledgerId: string,
) {
    const { entities } = getBudgetedSchema();

    return queryAllPages(
        entities.transactionClassificationSettings.query.bySettings({ ledgerId }),
        { consistent: true },
    ) as Promise<TransactionClassificationSettingsRecord[]>;
}
