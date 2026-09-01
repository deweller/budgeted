// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    deleteEmbeddingForSource: vi.fn(),
    templateDelete: vi.fn(),
    templateDeleteGo: vi.fn(),
    templateGet: vi.fn(),
    templateGetGo: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            transactionTemplates: {
                delete: mocks.templateDelete,
                get: mocks.templateGet,
            },
        },
    }),
}));

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-embedding-service",
    () => ({
        deleteTransactionClassificationEmbeddingForSource:
            mocks.deleteEmbeddingForSource,
        syncTransactionClassificationEmbeddingForTemplate: vi.fn(),
    }),
);

import { deleteTransactionTemplate } from "@/features/transaction-templates/server/transaction-template-service";

describe("transaction template classification isolation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.deleteEmbeddingForSource.mockResolvedValue(undefined);
        mocks.templateDelete.mockReturnValue({ go: mocks.templateDeleteGo });
        mocks.templateDeleteGo.mockResolvedValue({});
        mocks.templateGet.mockReturnValue({ go: mocks.templateGetGo });
        mocks.templateGetGo.mockResolvedValue({
            data: {
                createdAt: "2026-07-01T00:00:00.000Z",
                ledgerId: "ledger-1",
                linesJson: "[]",
                name: "Market",
                templateId: "template-1",
                updatedAt: "2026-07-01T00:00:00.000Z",
            },
        });
    });

    it("deletes a template without touching classification embeddings", async () => {
        await deleteTransactionTemplate("ledger-1", "template-1");

        expect(mocks.deleteEmbeddingForSource).not.toHaveBeenCalled();
        expect(mocks.templateDelete).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            templateId: "template-1",
        });
    });
});
