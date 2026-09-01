import { ulid } from "ulid";

import { transactionClassificationPromptVersion } from "@/features/transaction-classification/models/transaction-classification";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";

const INTERACTION_RETENTION_MS = 12 * 60 * 60 * 1000;
const DEFAULT_INTERACTION_LIMIT = 10;

export type TransactionClassificationInteractionRecord = {
    createdAt: string;
    expiresAt: number;
    interactionId: string;
    ledgerId: string;
    modelId: string;
    promptVersion: string;
    requestText: string;
    responseText: string;
};

export type TransactionClassificationInteractionPublic = Pick<
    TransactionClassificationInteractionRecord,
    | "createdAt"
    | "interactionId"
    | "modelId"
    | "promptVersion"
    | "requestText"
    | "responseText"
>;

export function getTransactionClassificationInteractionExpiresAt(
    now = new Date(),
) {
    return Math.floor((now.getTime() + INTERACTION_RETENTION_MS) / 1000);
}

function getInteractionCutoff(now = new Date()) {
    return new Date(now.getTime() - INTERACTION_RETENTION_MS).toISOString();
}

function isRetainedInteraction(
    record: TransactionClassificationInteractionRecord,
    now = new Date(),
) {
    return (
        record.createdAt >= getInteractionCutoff(now) &&
        record.expiresAt > Math.floor(now.getTime() / 1000)
    );
}

export function formatTransactionClassificationInteractionText(value: unknown) {
    if (typeof value === "string") {
        return value;
    }

    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

export function formatTransactionClassificationRequestText(input: {
    body?: unknown;
    prompt: string;
    system: string;
}) {
    return formatTransactionClassificationInteractionText(
        input.body ?? {
            prompt: input.prompt,
            system: input.system,
        },
    );
}

export function formatTransactionClassificationResponseText(input: {
    body?: unknown;
    object: unknown;
}) {
    return formatTransactionClassificationInteractionText(
        input.body ?? input.object,
    );
}

export async function recordTransactionClassificationInteraction(input: {
    ledgerId: string;
    modelId: string;
    requestText: string;
    responseText: string;
}) {
    const { entities } = getBudgetedSchema();
    const now = new Date();
    const record = {
        createdAt: now.toISOString(),
        expiresAt: getTransactionClassificationInteractionExpiresAt(now),
        interactionId: ulid(),
        ledgerId: input.ledgerId,
        modelId: input.modelId,
        promptVersion: transactionClassificationPromptVersion,
        requestText: input.requestText,
        responseText: input.responseText,
    } satisfies TransactionClassificationInteractionRecord;

    await entities.transactionClassificationInteractions.put(record).go();

    return record;
}

export async function listRecentTransactionClassificationInteractions(
    ledgerId: string,
    limit = DEFAULT_INTERACTION_LIMIT,
) {
    const { entities } = getBudgetedSchema();
    const now = new Date();
    const records = (await queryAllPages(
        entities.transactionClassificationInteractions.query.byInteraction({
            ledgerId,
        }),
        { consistent: true },
    )) as TransactionClassificationInteractionRecord[];

    return records
        .filter((record) => isRetainedInteraction(record, now))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit)
        .map((record): TransactionClassificationInteractionPublic => ({
            createdAt: record.createdAt,
            interactionId: record.interactionId,
            modelId: record.modelId,
            promptVersion: record.promptVersion,
            requestText: record.requestText,
            responseText: record.responseText,
        }));
}
