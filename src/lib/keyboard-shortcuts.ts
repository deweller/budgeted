export type KeyboardShortcutDefinition = {
    altKey?: boolean;
    ctrlKey?: boolean;
    key: string;
    metaKey?: boolean;
    shiftKey?: boolean;
};

export type KeyboardShortcutHelpEntry = KeyboardShortcutDefinition & {
    action: string;
    description: string;
    id: string;
    where: string;
};

export type KeyboardShortcutHelpSection = {
    shortcuts: KeyboardShortcutHelpEntry[];
    title: string;
};

type KeyboardShortcutEvent = Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

function normalizeShortcutKey(key: string) {
    return key.length === 1 ? key.toLowerCase() : key;
}

export function matchesKeyboardShortcut(
    event: KeyboardShortcutEvent,
    shortcut: KeyboardShortcutDefinition,
) {
    return (
        normalizeShortcutKey(event.key) ===
            normalizeShortcutKey(shortcut.key) &&
        event.altKey === Boolean(shortcut.altKey) &&
        event.ctrlKey === Boolean(shortcut.ctrlKey) &&
        event.metaKey === Boolean(shortcut.metaKey) &&
        event.shiftKey === Boolean(shortcut.shiftKey)
    );
}

export const keyboardShortcuts = {
    budget: {
        openFilter: {
            action: "Open filter",
            description: "Open the monthly budget filter and focus Category.",
            id: "budget.openFilter",
            key: "/",
            where: "Monthly budget",
        },
    },
    home: {
        expandAllAutoMatchMemos: {
            action: "Expand all auto match memos",
            description:
                "Available only when a ready match is highlighted in Home > Auto Matches and no field, combobox, or dialog is active.",
            id: "home.expandAllAutoMatchMemos",
            key: "Enter",
            where: "Highlighted ready auto match",
        },
        rejectHighlightedAutoMatch: {
            action: "Do not merge auto match",
            description:
                "Available only when a ready match is highlighted in Home > Auto Matches and no field, combobox, or dialog is active.",
            id: "home.rejectHighlightedAutoMatch",
            key: "d",
            where: "Highlighted ready auto match",
        },
        mergeHighlightedAutoMatch: {
            action: "Merge auto match",
            description:
                "Available only when a ready match is highlighted in Home > Auto Matches and no field, combobox, or dialog is active.",
            id: "home.mergeHighlightedAutoMatch",
            key: "m",
            where: "Highlighted ready auto match",
        },
    },
    transactions: {
        activateNextTransaction: {
            action: "Activate next transaction",
            description:
                "Activate the next visible transaction and show its row actions.",
            id: "transactions.activateNextTransaction",
            key: "ArrowDown",
            where: "Transactions list",
        },
        activatePreviousTransaction: {
            action: "Activate previous transaction",
            description:
                "Activate the previous visible transaction and show its row actions.",
            id: "transactions.activatePreviousTransaction",
            key: "ArrowUp",
            where: "Transactions list",
        },
        editHighlightedTransaction: {
            action: "Edit transaction",
            description:
                "Open the highlighted transaction in inline edit mode and focus Payee.",
            id: "transactions.editHighlightedTransaction",
            key: "Enter",
            where: "Highlighted transaction",
        },
        createTransaction: {
            action: "New transaction",
            ctrlKey: true,
            description: "Open the new transaction dialog.",
            id: "transactions.createTransaction",
            key: "n",
            where: "Transactions list",
        },
        openFilter: {
            action: "Open filter",
            description: "Open the transaction filter and focus Payee/Memo.",
            id: "transactions.openFilter",
            key: "/",
            where: "Transactions list",
        },
        applyAiClassification: {
            action: "Apply AI classification",
            description:
                "Available only while a pending suggestion is visible and no field or combobox is focused.",
            id: "transactions.applyAiClassification",
            key: "a",
            where: "Pending AI classification",
        },
        rejectAiClassification: {
            action: "Reject AI classification",
            description:
                "Available only while a pending suggestion is visible and no field or combobox is focused.",
            id: "transactions.rejectAiClassification",
            key: "r",
            where: "Pending AI classification",
        },
        editAiClassification: {
            action: "Edit AI classification",
            description:
                "Available only while a pending suggestion is visible and no field or combobox is focused.",
            id: "transactions.editAiClassification",
            key: "e",
            where: "Pending AI classification",
        },
        saveMemo: {
            action: "Save transaction",
            description:
                "Save from a memo field. Plain Enter adds a new line instead.",
            id: "transactions.saveMemo",
            key: "Enter",
            metaKey: true,
            where: "Transaction memo field",
        },
        fillSplitDifference: {
            action: "Fill split difference",
            ctrlKey: true,
            description:
                "Fill the focused split line with the remaining difference.",
            id: "transactions.fillSplitDifference",
            key: "d",
            where: "Any field in a split transaction line",
        },
        openDeletePreview: {
            action: "Delete selected",
            description: "Open the delete preview for the selected transaction.",
            id: "transactions.openDeletePreview",
            key: "d",
            where: "Selected transaction",
        },
        openDeletePreviewWithBackspace: {
            action: "Delete selected",
            description:
                "Open the delete preview for the selected transaction.",
            id: "transactions.openDeletePreviewWithBackspace",
            key: "Backspace",
            where: "Selected transaction",
        },
        openDeletePreviewWithDeleteKey: {
            action: "Delete selected",
            description:
                "Open the delete preview for the selected transaction.",
            id: "transactions.openDeletePreviewWithDeleteKey",
            key: "Delete",
            where: "Selected transaction",
        },
        showTransferCounterparty: {
            action: "Show source/destination",
            description:
                "Open the account on the other side of the selected transfer.",
            id: "transactions.showTransferCounterparty",
            key: "s",
            where: "Selected transfer transaction",
        },
        openEditDetails: {
            action: "Edit details",
            description: "Open the details editor for the selected transaction.",
            id: "transactions.openEditDetails",
            key: "e",
            where: "Selected transaction",
        },
        mergeSelected: {
            action: "Merge selected",
            description: "Merge the two selected transactions.",
            id: "transactions.mergeSelected",
            key: "m",
            where: "Two selected transactions",
        },
        categorizeSelected: {
            action: "Categorize selected",
            description: "Choose a category for the selected transactions.",
            id: "transactions.categorizeSelected",
            key: "c",
            where: "Selected transactions",
        },
        unlockSelected: {
            action: "Unlock selected",
            description: "Unlock the selected reconciled transactions.",
            id: "transactions.unlockSelected",
            key: "u",
            where: "Selected reconciled transactions",
        },
        startInlineSplit: {
            action: "Split transaction",
            ctrlKey: true,
            description:
                "Convert the transaction editor into split mode.",
            id: "transactions.startInlineSplit",
            key: "s",
            where: "Transaction editor",
        },
    },
} as const satisfies {
    budget: Record<string, KeyboardShortcutHelpEntry>;
    home: Record<string, KeyboardShortcutHelpEntry>;
    transactions: Record<string, KeyboardShortcutHelpEntry>;
};

function formatShortcutKey(key: string) {
    return key.length === 1 ? key.toUpperCase() : key;
}

export function formatKeyboardShortcut(shortcut: KeyboardShortcutDefinition) {
    return [
        shortcut.ctrlKey ? "Ctrl" : null,
        shortcut.metaKey ? "Command" : null,
        shortcut.altKey ? "Alt" : null,
        shortcut.shiftKey ? "Shift" : null,
        formatShortcutKey(shortcut.key),
    ]
        .filter((part): part is string => Boolean(part))
        .join("+");
}

export const keyboardShortcutHelpSections = [
    {
        title: "Monthly budget",
        shortcuts: [keyboardShortcuts.budget.openFilter],
    },
    {
        title: "Transactions",
        shortcuts: [
            keyboardShortcuts.transactions.activateNextTransaction,
            keyboardShortcuts.transactions.activatePreviousTransaction,
            keyboardShortcuts.transactions.createTransaction,
            keyboardShortcuts.transactions.openFilter,
            keyboardShortcuts.transactions.saveMemo,
            keyboardShortcuts.transactions.openEditDetails,
            keyboardShortcuts.transactions.showTransferCounterparty,
            keyboardShortcuts.transactions.openDeletePreview,
            keyboardShortcuts.transactions.openDeletePreviewWithDeleteKey,
            keyboardShortcuts.transactions.openDeletePreviewWithBackspace,
            keyboardShortcuts.transactions.mergeSelected,
            keyboardShortcuts.transactions.categorizeSelected,
            keyboardShortcuts.transactions.unlockSelected,
            keyboardShortcuts.transactions.startInlineSplit,
            keyboardShortcuts.transactions.fillSplitDifference,
        ],
    },
    {
        title: "Home",
        shortcuts: [
            keyboardShortcuts.home.expandAllAutoMatchMemos,
        ],
    },
] as const satisfies readonly KeyboardShortcutHelpSection[];
