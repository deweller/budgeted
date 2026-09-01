// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
    RESET_WARNING_LABELS,
    classifyResetItem,
    getResetDeleteKey,
} from "@/lib/db/reset/reset-scope";

describe("reset scope classification", () => {
    it("preserves user accounts", () => {
        expect(
            classifyResetItem({
                __edb_e__: "userAccount",
                userId: "user-1",
                email: "user@example.com",
            }),
        ).toMatchObject({
            action: "preserve",
            label: "User accounts",
        });
    });

    it("clears budgeting entities", () => {
        expect(
            classifyResetItem({
                __edb_e__: "account",
            }),
        ).toMatchObject({
            action: "clear",
            label: "Accounts",
        });
    });

    it("clears budget groups", () => {
        expect(
            classifyResetItem({
                __edb_e__: "budgetGroup",
            }),
        ).toMatchObject({
            action: "clear",
            label: "Budget groups",
        });
        expect(RESET_WARNING_LABELS).toContain("Budget groups");
    });

    it("clears transaction audit logs", () => {
        expect(
            classifyResetItem({
                __edb_e__: "transactionAuditLog",
            }),
        ).toMatchObject({
            action: "clear",
            label: "Transaction audit logs",
        });
        expect(RESET_WARNING_LABELS).toContain("Transaction audit logs");
    });

    it("clears workspace mutation batches and receipts", () => {
        expect(
            classifyResetItem({
                __edb_e__: "workspaceMutationBatch",
            }),
        ).toMatchObject({
            action: "clear",
            label: "Workspace mutation batches",
        });
        expect(
            classifyResetItem({
                __edb_e__: "workspaceMutationReceipt",
            }),
        ).toMatchObject({
            action: "clear",
            label: "Workspace mutation receipts",
        });
    });

    it("ignores reset lock records", () => {
        expect(
            classifyResetItem({
                pk: "reset-lock#local",
                sk: "reset-lock",
            }),
        ).toEqual({
            action: "ignore",
        });
    });

    it("returns delete keys only when pk and sk are present", () => {
        expect(getResetDeleteKey({ pk: "pk-1", sk: "sk-1" })).toEqual({
            pk: "pk-1",
            sk: "sk-1",
        });
        expect(getResetDeleteKey({ pk: "pk-1" })).toBeNull();
    });
});
