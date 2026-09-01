import {
    TRANSACTION_CLASSIFICATION_OPENAI_MODEL_ID,
    type TransactionClassificationModelOption,
    type TransactionClassificationModelProvider,
} from "@/features/transaction-classification/models/transaction-classification";
import { HttpError } from "@/lib/api/errors";
import {
    resolveGoogleAiModel,
    resolveGoogleGenerativeAiApiKey,
    resolveOpenAiApiKey,
} from "@/lib/env/server";
import { normalizeOptionalString } from "@/lib/strings";

function hasConfiguredSecret(value: string | undefined) {
    return Boolean(normalizeOptionalString(value));
}

function getGoogleModelLabel(modelId: string) {
    return modelId === "gemini-3.5-flash"
        ? "Gemini 3.5 Flash"
        : `Google ${modelId}`;
}

export function getTransactionClassificationModelProvider(
    modelId: string,
): TransactionClassificationModelProvider {
    return modelId === TRANSACTION_CLASSIFICATION_OPENAI_MODEL_ID
        ? "openai"
        : "google";
}

export function getTransactionClassificationGenerationOptions(modelId: string) {
    return getTransactionClassificationModelProvider(modelId) === "openai"
        ? {
              providerOptions: {
                  openai: {
                      reasoningEffort: "medium" as const,
                  },
              },
          }
        : { temperature: 0 };
}

export function listAvailableTransactionClassificationModels(): TransactionClassificationModelOption[] {
    const googleModelId = resolveGoogleAiModel();
    const models: TransactionClassificationModelOption[] = [];

    if (hasConfiguredSecret(resolveOpenAiApiKey())) {
        models.push({
            label: "GPT-5.6 Luna",
            modelId: TRANSACTION_CLASSIFICATION_OPENAI_MODEL_ID,
            provider: "openai",
        });
    }

    if (hasConfiguredSecret(resolveGoogleGenerativeAiApiKey())) {
        models.push({
            label: getGoogleModelLabel(googleModelId),
            modelId: googleModelId,
            provider: "google",
        });
    }

    return models;
}

export function resolveAvailableTransactionClassificationModelId(
    preferredModelId?: string | null,
) {
    const availableModels = listAvailableTransactionClassificationModels();
    const normalizedModelId = normalizeOptionalString(preferredModelId);

    if (
        normalizedModelId &&
        availableModels.some((model) => model.modelId === normalizedModelId)
    ) {
        return normalizedModelId;
    }

    return availableModels[0]?.modelId ?? null;
}

export function resolveTransactionClassificationModelId(
    preferredModelId?: string | null,
) {
    return (
        resolveAvailableTransactionClassificationModelId(preferredModelId) ??
        normalizeOptionalString(preferredModelId) ??
        resolveGoogleAiModel()
    );
}

export function assertTransactionClassificationModelAvailable(modelId: string) {
    const availableModels = listAvailableTransactionClassificationModels();

    if (availableModels.some((model) => model.modelId === modelId)) {
        return;
    }

    throw new HttpError(
        400,
        "classification_model_unavailable",
        "That AI classification model is not configured for this ledger runtime.",
    );
}
