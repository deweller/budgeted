import { describe, expect, it } from "vitest";

import {
    WORKSPACE_ENTITY_CONFIGS,
    WORKSPACE_ENTITY_TYPES,
    createWorkspaceRecordReference,
    createWorkspaceRecordReferences,
    getWorkspaceEntityArrayKey,
    getWorkspaceEntityId,
} from "@/lib/workspace/entity-config";

describe("workspace entity config", () => {
    it("defines entity type, snapshot array, and id-field mappings together", () => {
        expect(WORKSPACE_ENTITY_TYPES).toEqual(
            WORKSPACE_ENTITY_CONFIGS.map((config) => config.entityType),
        );

        for (const config of WORKSPACE_ENTITY_CONFIGS) {
            const record = { [config.idKey]: `${config.entityType}-id` };

            expect(getWorkspaceEntityArrayKey(config.entityType)).toBe(
                config.arrayKey,
            );
            expect(getWorkspaceEntityId(config.entityType, record)).toBe(
                `${config.entityType}-id`,
            );
            expect(
                createWorkspaceRecordReference(config.entityType, record),
            ).toEqual({
                entityId: `${config.entityType}-id`,
                entityType: config.entityType,
                record,
            });
        }
    });

    it("creates tracked references from record arrays", () => {
        expect(
            createWorkspaceRecordReferences("budgetCategory", [
                { categoryId: "food", name: "Food" },
                { categoryId: "rent", name: "Rent" },
            ]),
        ).toEqual([
            {
                entityId: "food",
                entityType: "budgetCategory",
                record: { categoryId: "food", name: "Food" },
            },
            {
                entityId: "rent",
                entityType: "budgetCategory",
                record: { categoryId: "rent", name: "Rent" },
            },
        ]);
    });
});
