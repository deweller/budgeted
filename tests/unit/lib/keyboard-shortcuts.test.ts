import { describe, expect, it } from "vitest";

import {
    keyboardShortcutHelpSections,
    keyboardShortcuts,
} from "@/lib/keyboard-shortcuts";

describe("keyboard shortcuts", () => {
    it("defines and documents transaction arrow navigation", () => {
        expect(
            keyboardShortcuts.transactions.activateNextTransaction,
        ).toMatchObject({
            key: "ArrowDown",
            where: "Transactions list",
        });
        expect(
            keyboardShortcuts.transactions.activatePreviousTransaction,
        ).toMatchObject({
            key: "ArrowUp",
            where: "Transactions list",
        });
        const transactionShortcuts = keyboardShortcutHelpSections.find(
            (section) => section.title === "Transactions",
        )?.shortcuts;

        expect(transactionShortcuts).toContain(
            keyboardShortcuts.transactions.activateNextTransaction,
        );
        expect(transactionShortcuts).toContain(
            keyboardShortcuts.transactions.activatePreviousTransaction,
        );
    });

    it("defines and documents the transaction unlock shortcut", () => {
        expect(keyboardShortcuts.transactions.unlockSelected).toMatchObject({
            action: "Unlock selected",
            key: "u",
            where: "Selected reconciled transactions",
        });
        const transactionShortcuts = keyboardShortcutHelpSections.find(
            (section) => section.title === "Transactions",
        )?.shortcuts;

        expect(transactionShortcuts).toContain(
            keyboardShortcuts.transactions.unlockSelected,
        );
    });

    it("defines AI classification button shortcuts without adding them to help", () => {
        expect(keyboardShortcuts.transactions.applyAiClassification).toMatchObject({
            description:
                "Available only while a pending suggestion is visible and no field or combobox is focused.",
            key: "a",
            where: "Pending AI classification",
        });
        expect(keyboardShortcuts.transactions.rejectAiClassification).toMatchObject({
            key: "r",
            where: "Pending AI classification",
        });
        expect(keyboardShortcuts.transactions.editAiClassification).toMatchObject({
            key: "e",
            where: "Pending AI classification",
        });
        const transactionShortcuts = keyboardShortcutHelpSections.find(
            (section) => section.title === "Transactions",
        )?.shortcuts;

        expect(transactionShortcuts).not.toContain(
            keyboardShortcuts.transactions.applyAiClassification,
        );
        expect(transactionShortcuts).not.toContain(
            keyboardShortcuts.transactions.rejectAiClassification,
        );
        expect(transactionShortcuts).not.toContain(
            keyboardShortcuts.transactions.editAiClassification,
        );
    });

    it("documents only the unlabelled ready auto match shortcut", () => {
        expect(keyboardShortcuts.home.expandAllAutoMatchMemos).toMatchObject({
            key: "Enter",
            where: "Highlighted ready auto match",
        });
        expect(
            keyboardShortcuts.home.rejectHighlightedAutoMatch,
        ).toMatchObject({
            key: "d",
            where: "Highlighted ready auto match",
        });
        expect(keyboardShortcuts.home.mergeHighlightedAutoMatch).toMatchObject({
            key: "m",
            where: "Highlighted ready auto match",
        });

        const homeShortcuts = keyboardShortcutHelpSections.find(
            (section) => section.title === "Home",
        )?.shortcuts;

        expect(homeShortcuts).toContain(
            keyboardShortcuts.home.expandAllAutoMatchMemos,
        );
        expect(homeShortcuts).not.toContain(
            keyboardShortcuts.home.rejectHighlightedAutoMatch,
        );
        expect(homeShortcuts).not.toContain(
            keyboardShortcuts.home.mergeHighlightedAutoMatch,
        );
    });

    it("documents Command+Enter for saving from a transaction memo", () => {
        expect(keyboardShortcuts.transactions.saveMemo).toMatchObject({
            action: "Save transaction",
            key: "Enter",
            metaKey: true,
            where: "Transaction memo field",
        });
        expect(
            keyboardShortcutHelpSections.find(
                (section) => section.title === "Transactions",
            )?.shortcuts,
        ).toContain(keyboardShortcuts.transactions.saveMemo);
    });
});
