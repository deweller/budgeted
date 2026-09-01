"use client";

import {
    useMemo,
    useRef,
    useState,
    type MouseEvent,
    type ReactNode,
} from "react";
import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
    type UniqueIdentifier,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    faCalendar,
    faCalendarDays,
    faCaretDown,
    faCaretRight,
    faCartShopping,
    faPlus,
    faPiggyBank,
    faGripVertical,
    faPenToSquare,
    faSquare,
    faSquareCheck,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { DialogCloseButton } from "@/components/shared/dialog-close-button";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { InlineEditableField } from "@/components/shared/inline-editable-field";
import { MoneyAmount } from "@/components/shared/money-amount";
import { SelectionActionBar } from "@/components/shared/selection-action-bar";
import { useInitialFocus } from "@/components/shared/use-initial-focus";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type { DeletionImpactSummary } from "@/features/shared/models/deletion-impact";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { parseUsdToCents } from "@/lib/formatting/money";
import {
    BUDGET_CATEGORY_ALLOCATION_MONTHS,
    normalizeBudgetCategoryAllocationCadence,
    normalizeBudgetCategoryAllocationStartMonth,
    type BudgetCategoryAllocationCadence,
} from "@/modules/budgeting/allocation-schedule";
import {
    formatBudgetCategoryType,
    normalizeBudgetCategoryType,
    type BudgetCategoryType,
} from "@/modules/budgeting/category-type";
import {
    controlClassNames,
    getMoneyToneClassName,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import {
    createOptimisticWorkspaceUpsert,
    type OptimisticWorkspaceChange,
} from "@/lib/workspace/optimistic-changes";

type GlobalPlanEditorGroup = {
    groupId: string;
    name: string;
    sortOrder: number;
    status: "active" | "archived";
};

type GlobalPlanEditorCategory = {
    allocationCadence?: BudgetCategoryAllocationCadence;
    allocationStartMonth?: number;
    categoryId: string;
    categoryType?: BudgetCategoryType;
    defaultAssignedCents: number;
    groupId: string;
    isIncomeCategory: boolean;
    name: string;
    sortOrder: number;
    status: "active" | "archived";
    systemCategoryKey?: "startingBalances";
};

type GlobalPlanEditorProps = {
    categories: GlobalPlanEditorCategory[];
    groups: GlobalPlanEditorGroup[];
};

type GlobalPlanCategoryDraft = {
    allocationCadence: BudgetCategoryAllocationCadence;
    allocationStartMonth: number;
    categoryType: BudgetCategoryType;
    defaultAssignedValue: string;
    groupId: string;
    name: string;
};

type GlobalPlanGroupDraft = {
    name: string;
};

type CategoryEditDraft = {
    allocationCadence: BudgetCategoryAllocationCadence;
    allocationStartMonth: number;
    categoryType: BudgetCategoryType;
    defaultAssignedValue: string;
    name: string;
};

const categoryTypeOptions: ComboboxSelectOption[] = [
    { label: "Spending", value: "spending" },
    { label: "Savings", value: "savings" },
];

const allocationCadenceOptions: ComboboxSelectOption[] = [
    { label: "Monthly", value: "monthly" },
    { label: "Yearly", value: "yearly" },
];

const allocationStartMonthOptions: ComboboxSelectOption[] =
    BUDGET_CATEGORY_ALLOCATION_MONTHS.map((month) => ({
        label: month.label,
        value: String(month.value),
    }));

const compactBudgetPlanActionClassName =
    "inline-flex cursor-pointer items-center gap-1.5 border border-[var(--color-border)] bg-[var(--color-panel-strong)] px-2 py-1 text-[0.6875rem] font-medium leading-4 text-[var(--color-ink)] transition hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)] disabled:cursor-not-allowed disabled:opacity-60";

const compactBudgetPlanDangerActionClassName =
    "cursor-pointer border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] px-2 py-1 text-[0.6875rem] font-medium leading-4 text-[var(--tone-error-ink)] transition hover:bg-[var(--tone-error-surface-strong)] disabled:cursor-not-allowed disabled:opacity-60";

function formatDefaultAssignedAmount(value: number) {
    return (value / 100).toFixed(2);
}

function createCategoryDraft(category: GlobalPlanEditorCategory) {
    return {
        allocationCadence: normalizeBudgetCategoryAllocationCadence(
            category.allocationCadence,
        ),
        allocationStartMonth: normalizeBudgetCategoryAllocationStartMonth(
            category.allocationStartMonth,
        ),
        categoryType: normalizeBudgetCategoryType(category.categoryType),
        defaultAssignedValue: formatDefaultAssignedAmount(
            category.defaultAssignedCents,
        ),
        groupId: category.groupId,
        name: category.name,
    } satisfies GlobalPlanCategoryDraft;
}

function createGroupDraft(group: GlobalPlanEditorGroup) {
    return {
        name: group.name,
    } satisfies GlobalPlanGroupDraft;
}

function parseDefaultAssignedCents(value: string) {
    try {
        return parseUsdToCents(value);
    } catch {
        return 0;
    }
}

function getDefaultAssignedToneClassName(value: string) {
    return getMoneyToneClassName(parseDefaultAssignedCents(value));
}

function formatAllocationSchedule(draft: GlobalPlanCategoryDraft) {
    if (draft.allocationCadence === "monthly") {
        return "Monthly";
    }

    const startMonth = BUDGET_CATEGORY_ALLOCATION_MONTHS.find(
        (month) => month.value === draft.allocationStartMonth,
    );

    return `Yearly · ${startMonth?.label ?? "January"}`;
}

function CategorySelectionCheckbox({
    checked,
    label,
    onClick,
}: {
    checked: boolean;
    label: string;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={checked ? `Deselect ${label}` : `Select ${label}`}
            onClick={onClick}
            onMouseDown={(event) => {
                event.stopPropagation();
                if (event.shiftKey) {
                    event.preventDefault();
                }
            }}
            className="inline-flex size-5 cursor-pointer items-center justify-center text-[var(--color-muted)] transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
        >
            <FontAwesomeIcon
                aria-hidden="true"
                icon={checked ? faSquareCheck : faSquare}
                className={
                    checked
                        ? "text-[var(--color-accent-contrast)]"
                        : "text-[var(--color-muted)]"
                }
            />
        </button>
    );
}

function createGroupDragId(groupId: string) {
    return `group:${groupId}`;
}

function createGroupDropId(groupId: string) {
    return `group-drop:${groupId}`;
}

function createCategoryDragId(categoryId: string) {
    return `category:${categoryId}`;
}

function parseDragId(id: UniqueIdentifier | null | undefined) {
    const value = String(id ?? "");

    if (value.startsWith("group-drop:")) {
        return {
            type: "group-drop" as const,
            id: value.slice("group-drop:".length),
        };
    }

    if (value.startsWith("group:")) {
        return {
            type: "group" as const,
            id: value.slice("group:".length),
        };
    }

    if (value.startsWith("category:")) {
        return {
            type: "category" as const,
            id: value.slice("category:".length),
        };
    }

    return null;
}

type ParsedDragId = NonNullable<ReturnType<typeof parseDragId>>;

function createCategoriesRevision(
    groups: GlobalPlanEditorGroup[],
    categories: GlobalPlanEditorCategory[],
) {
    return [
        groups
            .map((group) =>
                [group.groupId, group.name, group.status, group.sortOrder].join(
                    ":",
                ),
            )
            .join("|"),
        categories
            .map((category) =>
                [
                    category.categoryId,
                    category.allocationCadence,
                    category.allocationStartMonth,
                    category.defaultAssignedCents,
                    category.groupId,
                    category.name,
                    category.status,
                    category.sortOrder,
                ].join(":"),
            )
            .join("|"),
    ].join("::");
}

function createCategoryDrafts(categories: GlobalPlanEditorCategory[]) {
    return Object.fromEntries(
        categories.map((category) => [
            category.categoryId,
            createCategoryDraft(category),
        ]),
    ) as Record<string, GlobalPlanCategoryDraft>;
}

function createGroupDrafts(groups: GlobalPlanEditorGroup[]) {
    return Object.fromEntries(
        groups.map((group) => [group.groupId, createGroupDraft(group)]),
    ) as Record<string, GlobalPlanGroupDraft>;
}

function createGroupOrder(groups: GlobalPlanEditorGroup[]) {
    return [...groups]
        .sort((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
                return left.sortOrder - right.sortOrder;
            }

            return left.name.localeCompare(right.name);
        })
        .map((group) => group.groupId);
}

function createCategoryOrderByGroupId(
    groups: GlobalPlanEditorGroup[],
    categories: GlobalPlanEditorCategory[],
) {
    const orderByGroupId = Object.fromEntries(
        groups.map((group) => [group.groupId, [] as string[]]),
    ) as Record<string, string[]>;

    for (const category of [...categories].sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
        }

        return left.name.localeCompare(right.name);
    })) {
        orderByGroupId[category.groupId] = [
            ...(orderByGroupId[category.groupId] ?? []),
            category.categoryId,
        ];
    }

    return orderByGroupId;
}

function findCategoryGroupId(
    categoryOrderByGroupId: Record<string, string[]>,
    categoryId: string,
) {
    return Object.entries(categoryOrderByGroupId).find(([, categoryIds]) =>
        categoryIds.includes(categoryId),
    )?.[0];
}

function removeCategoryFromOrders(
    categoryOrderByGroupId: Record<string, string[]>,
    categoryId: string,
) {
    return Object.fromEntries(
        Object.entries(categoryOrderByGroupId).map(([groupId, categoryIds]) => [
            groupId,
            categoryIds.filter((id) => id !== categoryId),
        ]),
    ) as Record<string, string[]>;
}

export function GlobalPlanEditor({
    categories,
    groups,
}: GlobalPlanEditorProps) {
    return (
        <GlobalPlanEditorContent
            key={createCategoriesRevision(groups, categories)}
            categories={categories}
            groups={groups}
        />
    );
}

function SortableGroupSection({
    children,
    group,
    groupName,
    isCollapsed,
    isGroupSelected,
    isReordering,
    isSubmitting,
    onAddCategory,
    onEditGroup,
    onToggleCollapsed,
    onToggleGroupSelection,
}: {
    children: ReactNode;
    group: GlobalPlanEditorGroup;
    groupName: string;
    isCollapsed: boolean;
    isGroupSelected: boolean;
    isReordering: boolean;
    isSubmitting: boolean;
    onAddCategory: () => void;
    onEditGroup: () => void;
    onToggleCollapsed: () => void;
    onToggleGroupSelection: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: createGroupDragId(group.groupId),
        disabled: !isReordering,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <section
            ref={setNodeRef}
            style={style}
            className={`border border-[var(--color-border)] bg-[var(--color-panel)] ${
                isDragging ? "relative z-20 opacity-80" : ""
            }`}
        >
            <div
                className={`grid gap-2 border-b border-[var(--color-border)] bg-[var(--color-panel-strong)] px-4 py-2 sm:items-center ${
                    isReordering
                        ? "sm:grid-cols-[auto_auto_1fr]"
                        : "sm:grid-cols-[auto_auto_1fr_auto]"
                }`}
            >
                {isReordering ? (
                    <button
                        type="button"
                        {...attributes}
                        {...listeners}
                        aria-label={`Drag group ${groupName}`}
                        className="inline-flex size-8 cursor-grab items-center justify-center text-[var(--color-muted)] transition hover:text-[var(--color-ink)] active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isSubmitting}
                    >
                        <FontAwesomeIcon
                            aria-hidden="true"
                            icon={faGripVertical}
                        />
                    </button>
                ) : null}
                {!isReordering ? (
                    <CategorySelectionCheckbox
                        checked={isGroupSelected}
                        label={`all categories in ${groupName}`}
                        onClick={onToggleGroupSelection}
                    />
                ) : null}
                <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${groupName}`}
                    onClick={onToggleCollapsed}
                    className="inline-flex size-5 cursor-pointer items-center justify-center text-[var(--color-muted)] transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                >
                    <FontAwesomeIcon
                        aria-hidden="true"
                        className="text-base"
                        icon={isCollapsed ? faCaretRight : faCaretDown}
                    />
                </button>
                <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                    {groupName}
                </h3>
                {!isReordering ? (
                    <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                        <button
                            type="button"
                            onClick={onEditGroup}
                            disabled={isSubmitting}
                            className={compactBudgetPlanActionClassName}
                        >
                            <FontAwesomeIcon
                                aria-hidden="true"
                                icon={faPenToSquare}
                            />
                            Edit group
                        </button>
                        <button
                            type="button"
                            onClick={onAddCategory}
                            disabled={isSubmitting}
                            className={compactBudgetPlanActionClassName}
                        >
                            <FontAwesomeIcon
                                aria-hidden="true"
                                icon={faPlus}
                            />
                            Add category
                        </button>
                    </div>
                ) : null}
            </div>
            {isCollapsed ? null : children}
        </section>
    );
}

function DroppableCategoryBody({
    children,
    groupId,
    isReordering,
}: {
    children: ReactNode;
    groupId: string;
    isReordering: boolean;
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: createGroupDropId(groupId),
        disabled: !isReordering,
    });

    return (
        <tbody
            ref={setNodeRef}
            className={
                isOver
                    ? "bg-[var(--color-accent-soft)]"
                    : "bg-[var(--color-panel)]"
            }
        >
            {children}
        </tbody>
    );
}

function SortableCategoryRow({
    category,
    categoryName,
    children,
    isSelected,
    isReordering,
    onSelect,
}: {
    category: GlobalPlanEditorCategory;
    categoryName: string;
    children: ReactNode;
    isSelected: boolean;
    isReordering: boolean;
    onSelect: (input: { shiftKey: boolean }) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: createCategoryDragId(category.categoryId),
        disabled: !isReordering,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <tr
            ref={setNodeRef}
            style={style}
            onClick={(event) => {
                if (
                    isReordering ||
                    event.target instanceof Element &&
                        event.target.closest(
                            "button, input, select, textarea, a, [role='button']",
                        )
                ) {
                    return;
                }

                onSelect({ shiftKey: event.shiftKey });
            }}
            className={`border-b border-[var(--color-border)]/70 last:border-b-0 ${
                isDragging
                    ? "relative z-20 bg-[var(--color-panel-elevated)] opacity-30"
                    : isReordering
                      ? ""
                      : "cursor-pointer"
            }`}
        >
            {isReordering ? (
                <td className="w-12 px-4 py-2 align-middle">
                    <button
                        type="button"
                        {...attributes}
                        {...listeners}
                        aria-label={`Drag category ${categoryName}`}
                        className="inline-flex size-7 cursor-grab items-center justify-center text-[var(--color-muted)] transition hover:text-[var(--color-ink)] active:cursor-grabbing"
                    >
                        <FontAwesomeIcon
                            aria-hidden="true"
                            icon={faGripVertical}
                        />
                    </button>
                </td>
            ) : null}
            {!isReordering ? (
                <td className="w-12 px-4 py-2 align-middle">
                    <CategorySelectionCheckbox
                        checked={isSelected}
                        label={categoryName}
                        onClick={(event) =>
                            onSelect({ shiftKey: event.shiftKey })
                        }
                    />
                </td>
            ) : null}
            {children}
        </tr>
    );
}

function CategoryDragPreview({
    categoryName,
    defaultAssignedValue,
    isSystemManaged,
}: {
    categoryName: string;
    defaultAssignedValue: string;
    isSystemManaged: boolean;
}) {
    return (
        <div className="grid w-[min(44rem,calc(100vw-2rem))] grid-cols-[auto_1fr_auto] items-center gap-4 border border-[var(--color-border-strong)] bg-[var(--color-panel-elevated)] px-4 py-3 text-sm shadow-2xl">
            <FontAwesomeIcon
                aria-hidden="true"
                className="text-[var(--color-muted)]"
                icon={faGripVertical}
            />
            <div className="grid gap-1">
                <span className="font-medium text-[var(--color-ink)]">
                    {categoryName}
                </span>
                {isSystemManaged ? (
                    <span className="text-xs text-[var(--color-muted)]">
                        System managed
                    </span>
                ) : null}
            </div>
            <span
                className={`text-right font-medium ${getDefaultAssignedToneClassName(defaultAssignedValue)}`}
            >
                <MoneyAmount
                    cents={parseDefaultAssignedCents(defaultAssignedValue)}
                />
            </span>
        </div>
    );
}

function GroupDragPreview({ groupName }: { groupName: string }) {
    return (
        <div className="grid w-[min(44rem,calc(100vw-2rem))] grid-cols-[auto_1fr] items-center gap-4 border border-[var(--color-border-strong)] bg-[var(--color-panel-elevated)] px-4 py-3 text-sm shadow-2xl">
            <FontAwesomeIcon
                aria-hidden="true"
                className="text-[var(--color-muted)]"
                icon={faGripVertical}
            />
            <span className="font-semibold text-[var(--color-ink)]">
                {groupName}
            </span>
        </div>
    );
}

function CategoryEditDialog({
    category,
    draft,
    isSubmitting,
    onApply,
    onClose,
}: {
    category: GlobalPlanEditorCategory;
    draft: CategoryEditDraft;
    isSubmitting: boolean;
    onApply: (draft: CategoryEditDraft) => void;
    onClose: () => void;
}) {
    const [localDraft, setLocalDraft] = useState(draft);
    const nameInputRef = useRef<HTMLInputElement>(null);

    useInitialFocus(nameInputRef, { select: true });

    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <form
                aria-modal="true"
                className={`grid max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-2xl gap-5 overflow-y-auto p-6 ${surfaceClassNames.panel}`}
                role="dialog"
                onSubmit={(event) => {
                    event.preventDefault();
                    onApply(localDraft);
                }}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="grid gap-1">
                        <p className={typographyClassNames.eyebrow}>Category</p>
                        <h2 className="text-2xl font-semibold tracking-tight">
                            Edit category
                        </h2>
                    </div>
                    <DialogCloseButton
                        aria-label="Close category dialog"
                        disabled={isSubmitting}
                        onClick={onClose}
                    />
                </div>

                <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                    Category name
                    <input
                        ref={nameInputRef}
                        required
                        className={controlClassNames.field}
                        value={localDraft.name}
                        onChange={(event) =>
                            setLocalDraft((current) => ({
                                ...current,
                                name: event.target.value,
                            }))
                        }
                    />
                </label>

                <ComboboxSelect
                    disabled={
                        isSubmitting ||
                        category.systemCategoryKey === "startingBalances"
                    }
                    label="Category type"
                    onChange={(value) =>
                        setLocalDraft((current) => ({
                            ...current,
                            categoryType: normalizeBudgetCategoryType(value),
                        }))
                    }
                    options={categoryTypeOptions}
                    value={localDraft.categoryType}
                />

                <ComboboxSelect
                    disabled={
                        isSubmitting ||
                        category.systemCategoryKey === "startingBalances"
                    }
                    label="Schedule"
                    onChange={(value) =>
                        setLocalDraft((current) => ({
                            ...current,
                            allocationCadence:
                                normalizeBudgetCategoryAllocationCadence(value),
                        }))
                    }
                    options={allocationCadenceOptions}
                    value={localDraft.allocationCadence}
                />

                {localDraft.allocationCadence === "yearly" ? (
                    <ComboboxSelect
                        disabled={
                            isSubmitting ||
                            category.systemCategoryKey === "startingBalances"
                        }
                        label="Start month"
                        onChange={(value) =>
                            setLocalDraft((current) => ({
                                ...current,
                                allocationStartMonth:
                                    normalizeBudgetCategoryAllocationStartMonth(
                                        Number(value),
                                    ),
                            }))
                        }
                        options={allocationStartMonthOptions}
                        value={String(localDraft.allocationStartMonth)}
                    />
                ) : null}

                <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                    Amount
                    <input
                        className={controlClassNames.field}
                        disabled={
                            isSubmitting ||
                            category.systemCategoryKey === "startingBalances"
                        }
                        inputMode="decimal"
                        required
                        value={localDraft.defaultAssignedValue}
                        onChange={(event) =>
                            setLocalDraft((current) => ({
                                ...current,
                                defaultAssignedValue: event.target.value,
                            }))
                        }
                    />
                </label>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className={controlClassNames.secondaryAction}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={
                            isSubmitting ||
                            !localDraft.name.trim() ||
                            !localDraft.defaultAssignedValue.trim() ||
                            category.systemCategoryKey === "startingBalances"
                        }
                        className={controlClassNames.primaryAction}
                    >
                        Apply changes
                    </button>
                </div>
            </form>
        </div>
    );
}

function GroupDialog({
    initialName = "",
    isSubmitting,
    onClose,
    onSubmit,
    submitLabel,
    title,
}: {
    initialName?: string;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (name: string) => void;
    submitLabel: string;
    title: string;
}) {
    const [name, setName] = useState(initialName);
    const nameInputRef = useRef<HTMLInputElement>(null);

    useInitialFocus(nameInputRef, { select: true });

    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <form
                aria-modal="true"
                className={`grid max-h-[min(32rem,calc(100vh-2rem))] w-full max-w-xl gap-5 overflow-y-auto p-6 ${surfaceClassNames.panel}`}
                role="dialog"
                onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit(name);
                }}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="grid gap-1">
                        <p className={typographyClassNames.eyebrow}>Group</p>
                        <h2 className="text-2xl font-semibold tracking-tight">
                            {title}
                        </h2>
                    </div>
                    <DialogCloseButton
                        aria-label="Close group dialog"
                        disabled={isSubmitting}
                        onClick={onClose}
                    />
                </div>

                <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                    Group name
                    <input
                        ref={nameInputRef}
                        required
                        className={controlClassNames.field}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className={controlClassNames.secondaryAction}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting || !name.trim()}
                        className={controlClassNames.primaryAction}
                    >
                        {submitLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}

function CategoryCreateDialog({
    groupName,
    isSubmitting,
    onClose,
    onSubmit,
}: {
    groupName: string;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (name: string) => void;
}) {
    const [name, setName] = useState("");
    const nameInputRef = useRef<HTMLInputElement>(null);

    useInitialFocus(nameInputRef);

    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <form
                aria-modal="true"
                className={`grid max-h-[min(32rem,calc(100vh-2rem))] w-full max-w-xl gap-5 overflow-y-auto p-6 ${surfaceClassNames.panel}`}
                role="dialog"
                onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit(name);
                }}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="grid gap-1">
                        <p className={typographyClassNames.eyebrow}>{groupName}</p>
                        <h2 className="text-2xl font-semibold tracking-tight">
                            Add category
                        </h2>
                    </div>
                    <DialogCloseButton
                        aria-label="Close category dialog"
                        disabled={isSubmitting}
                        onClick={onClose}
                    />
                </div>

                <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                    Category name
                    <input
                        ref={nameInputRef}
                        required
                        className={controlClassNames.field}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className={controlClassNames.secondaryAction}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting || !name.trim()}
                        className={controlClassNames.primaryAction}
                    >
                        Save category
                    </button>
                </div>
            </form>
        </div>
    );
}

function GlobalPlanEditorContent({
    categories,
    groups,
}: GlobalPlanEditorProps) {
    const {
        applyWorkspaceMutationResponse,
        executeWorkspaceCommand,
        snapshot,
        reconcileFullWorkspaceMutation,
    } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [deleteCategory, setDeleteCategory] = useState<{
        categoryId: string;
        name: string;
    } | null>(null);
    const [deleteImpact, setDeleteImpact] =
        useState<DeletionImpactSummary | null>(null);
    const [deletePreviewError, setDeletePreviewError] = useState<string | null>(
        null,
    );
    const [createCategoryGroupId, setCreateCategoryGroupId] = useState<
        string | null
    >(null);
    const [isCreateGroupDialogOpen, setIsCreateGroupDialogOpen] =
        useState(false);
    const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
    const [editGroupId, setEditGroupId] = useState<string | null>(null);
    const [isReordering, setIsReordering] = useState(false);
    const isSubmitting = false;
    const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
    const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);
    const [activeDrag, setActiveDrag] = useState<ParsedDragId | null>(null);
    const [isLoadingDeletePreview, setIsLoadingDeletePreview] = useState(false);
    const [pendingDeleteCategoryId, setPendingDeleteCategoryId] = useState<
        string | null
    >(null);
    const [categoryDrafts, setCategoryDrafts] = useState<
        Record<string, GlobalPlanCategoryDraft>
    >(() => createCategoryDrafts(categories));
    const [groupDrafts, setGroupDrafts] = useState<
        Record<string, GlobalPlanGroupDraft>
    >(() => createGroupDrafts(groups));
    const [groupOrder, setGroupOrder] = useState(() =>
        createGroupOrder(groups),
    );
    const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const [categoryOrderByGroupId, setCategoryOrderByGroupId] = useState(() =>
        createCategoryOrderByGroupId(groups, categories),
    );
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
        [],
    );
    const [selectionAnchorCategoryId, setSelectionAnchorCategoryId] =
        useState<string | null>(null);
    const [selectedCategoryScheduleAction, setSelectedCategoryScheduleAction] =
        useState("");
    const [selectedCategoryTypeAction, setSelectedCategoryTypeAction] =
        useState("");
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const groupsById = useMemo(
        () => new Map(groups.map((group) => [group.groupId, group])),
        [groups],
    );
    const categoriesById = useMemo(
        () =>
            new Map(
                categories.map((category) => [category.categoryId, category]),
            ),
        [categories],
    );
    const editingCategory = editCategoryId
        ? categoriesById.get(editCategoryId)
        : undefined;
    const editingGroup = editGroupId ? groupsById.get(editGroupId) : undefined;
    const createCategoryGroup = createCategoryGroupId
        ? groupsById.get(createCategoryGroupId)
        : undefined;
    const visibleCategoryIds = useMemo(
        () =>
            groupOrder.flatMap(
                (groupId) => categoryOrderByGroupId[groupId] ?? [],
            ),
        [categoryOrderByGroupId, groupOrder],
    );
    const selectedCategoryIdSet = useMemo(
        () => new Set(selectedCategoryIds),
        [selectedCategoryIds],
    );
    const selectedCategoryCount = selectedCategoryIds.length;

    function toggleGroupCollapsed(groupId: string) {
        setCollapsedGroupIds((current) => {
            const next = new Set(current);

            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }

            return next;
        });
    }

    function getCategoryRangeIds(
        startCategoryId: string,
        endCategoryId: string,
    ) {
        const startIndex = visibleCategoryIds.indexOf(startCategoryId);
        const endIndex = visibleCategoryIds.indexOf(endCategoryId);

        if (startIndex < 0 || endIndex < 0) {
            return [endCategoryId];
        }

        const [fromIndex, toIndex] =
            startIndex <= endIndex
                ? [startIndex, endIndex]
                : [endIndex, startIndex];

        return visibleCategoryIds.slice(fromIndex, toIndex + 1);
    }

    function selectCategory(
        categoryId: string,
        input: { shiftKey: boolean },
    ) {
        if (input.shiftKey) {
            const anchorCategoryId =
                selectionAnchorCategoryId ??
                selectedCategoryIds[selectedCategoryIds.length - 1] ??
                categoryId;
            const rangeCategoryIds = getCategoryRangeIds(
                anchorCategoryId,
                categoryId,
            );

            setSelectedCategoryIds((current) =>
                Array.from(new Set([...current, ...rangeCategoryIds])),
            );
            setSelectionAnchorCategoryId(categoryId);
            return;
        }

        if (selectedCategoryIdSet.has(categoryId)) {
            const nextSelection = selectedCategoryIds.filter(
                (selectedCategoryId) => selectedCategoryId !== categoryId,
            );
            setSelectedCategoryIds(nextSelection);
            setSelectionAnchorCategoryId(
                nextSelection[nextSelection.length - 1] ?? null,
            );
            return;
        }

        setSelectedCategoryIds((current) =>
            Array.from(new Set([...current, categoryId])),
        );
        setSelectionAnchorCategoryId(categoryId);
    }

    function toggleGroupCategorySelection(
        event: MouseEvent<HTMLButtonElement>,
        categoryIds: string[],
    ) {
        event.stopPropagation();

        if (categoryIds.length === 0) {
            return;
        }

        const allSelected = categoryIds.every((categoryId) =>
            selectedCategoryIdSet.has(categoryId),
        );

        if (allSelected) {
            const categoryIdSet = new Set(categoryIds);
            const nextSelection = selectedCategoryIds.filter(
                (categoryId) => !categoryIdSet.has(categoryId),
            );
            setSelectedCategoryIds(nextSelection);
            setSelectionAnchorCategoryId(
                nextSelection[nextSelection.length - 1] ?? null,
            );
            return;
        }

        setSelectedCategoryIds((current) =>
            Array.from(new Set([...current, ...categoryIds])),
        );
        setSelectionAnchorCategoryId(categoryIds[categoryIds.length - 1]);
    }

    function clearCategorySelection() {
        setSelectedCategoryIds([]);
        setSelectionAnchorCategoryId(null);
        setSelectedCategoryScheduleAction("");
        setSelectedCategoryTypeAction("");
    }

    function getCategoryDraft(category: GlobalPlanEditorCategory) {
        return (
            categoryDrafts[category.categoryId] ?? createCategoryDraft(category)
        );
    }

    function getGroupDraft(group: GlobalPlanEditorGroup) {
        return groupDrafts[group.groupId] ?? createGroupDraft(group);
    }

    function updateCategoryDraft(
        category: GlobalPlanEditorCategory,
        update: Partial<GlobalPlanCategoryDraft>,
    ) {
        setCategoryDrafts((current) => ({
            ...current,
            [category.categoryId]: {
                ...(current[category.categoryId] ??
                    createCategoryDraft(category)),
                ...update,
            },
        }));
    }

    async function createGroup(name: string) {
        setIsSubmittingGroup(true);
        const activity = startActivity({
            completedLabel: "Group saved.",
            pendingLabel: "Saving group…",
        });

        try {
            const response = await fetch("/api/budget/groups", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name,
                    status: "active",
                }),
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to save group.",
                    ),
                );
            }

            setIsCreateGroupDialogOpen(false);
            await applyWorkspaceMutationResponse(response);
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message: `${error instanceof Error ? error.message : "Unable to save group."} The last saved budget structure is unchanged.`,
                title: "Group could not be saved.",
            });
        } finally {
            setIsSubmittingGroup(false);
        }
    }

    async function createCategory(input: { groupId: string; name: string }) {
        setIsSubmittingCategory(true);
        const activity = startActivity({
            completedLabel: "Category saved.",
            pendingLabel: "Saving category…",
        });

        try {
            const response = await fetch("/api/budget/categories", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    groupId: input.groupId,
                    name: input.name,
                    status: "active",
                }),
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to save category.",
                    ),
                );
            }

            setCreateCategoryGroupId(null);
            await applyWorkspaceMutationResponse(response);
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message: `${error instanceof Error ? error.message : "Unable to save category."} The last saved budget structure is unchanged. Review the inputs and try again.`,
                title: "Category could not be saved.",
            });
        } finally {
            setIsSubmittingCategory(false);
        }
    }

    function moveCategoryToGroupInOrder(
        current: Record<string, string[]>,
        input: {
            categoryId: string;
            targetGroupId: string;
            targetIndex?: number;
        },
    ) {
        const next = removeCategoryFromOrders(current, input.categoryId);
        const targetCategoryIds = [...(next[input.targetGroupId] ?? [])];
        const insertIndex =
            input.targetIndex === undefined
                ? targetCategoryIds.length
                : input.targetIndex;
        targetCategoryIds.splice(insertIndex, 0, input.categoryId);

        return {
            ...next,
            [input.targetGroupId]: targetCategoryIds,
        };
    }

    function moveCategoryToGroup(input: {
        categoryId: string;
        targetGroupId: string;
        targetIndex?: number;
    }) {
        setCategoryOrderByGroupId((current) =>
            moveCategoryToGroupInOrder(current, input),
        );
        setCategoryDrafts((current) => {
            const category = categoriesById.get(input.categoryId);

            if (!category) {
                return current;
            }

            return {
                ...current,
                [input.categoryId]: {
                    ...(current[input.categoryId] ??
                        createCategoryDraft(category)),
                    groupId: input.targetGroupId,
                },
            };
        });
    }

    function handleDragStart(event: DragStartEvent) {
        if (!isReordering) {
            return;
        }

        setActiveDrag(parseDragId(event.active.id));
    }

    function handleDragEnd(event: DragEndEvent) {
        if (!isReordering) {
            return;
        }

        const active = parseDragId(event.active.id);
        const over = parseDragId(event.over?.id);

        setActiveDrag(null);

        if (!active || !over) {
            return;
        }

        if (active.type === "group" && over.type === "group") {
            const oldIndex = groupOrder.indexOf(active.id);
            const newIndex = groupOrder.indexOf(over.id);

            if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
                const nextGroupOrder = arrayMove(
                    groupOrder,
                    oldIndex,
                    newIndex,
                );
                setGroupOrder(nextGroupOrder);
            }

            return;
        }

        if (active.type !== "category") {
            return;
        }

        const sourceGroupId = findCategoryGroupId(
            categoryOrderByGroupId,
            active.id,
        );
        const targetGroupId =
            over.type === "category"
                ? findCategoryGroupId(categoryOrderByGroupId, over.id)
                : over.id;

        if (!sourceGroupId || !targetGroupId) {
            return;
        }

        if (over.type === "group" || over.type === "group-drop") {
            moveCategoryToGroup({
                categoryId: active.id,
                targetGroupId,
            });
            return;
        }

        const sourceCategoryIds = categoryOrderByGroupId[sourceGroupId] ?? [];
        const targetCategoryIds = categoryOrderByGroupId[targetGroupId] ?? [];
        const oldIndex = sourceCategoryIds.indexOf(active.id);
        const newIndex = targetCategoryIds.indexOf(over.id);

        if (oldIndex < 0 || newIndex < 0) {
            return;
        }

        if (sourceGroupId === targetGroupId) {
            if (oldIndex !== newIndex) {
                const nextCategoryOrderByGroupId = {
                    ...categoryOrderByGroupId,
                    [sourceGroupId]: arrayMove(
                        categoryOrderByGroupId[sourceGroupId] ?? [],
                        oldIndex,
                        newIndex,
                    ),
                };
                setCategoryOrderByGroupId(nextCategoryOrderByGroupId);
            }
            return;
        }

        moveCategoryToGroup({
            categoryId: active.id,
            targetGroupId,
            targetIndex: newIndex,
        });
    }

    function cancelReorder() {
        setActiveDrag(null);
        setCategoryDrafts(createCategoryDrafts(categories));
        setGroupOrder(createGroupOrder(groups));
        setCategoryOrderByGroupId(createCategoryOrderByGroupId(groups, categories));
        setIsReordering(false);
    }

    function saveReorder() {
        setActiveDrag(null);
        savePlan(
            { categoryOrderByGroupId, groupOrder },
            "Budget plan order saved.",
        );
        setIsReordering(false);
    }

    function renderDragOverlay() {
        if (!activeDrag) {
            return null;
        }

        if (activeDrag.type === "group") {
            const group = groupsById.get(activeDrag.id);

            if (!group) {
                return null;
            }

            return <GroupDragPreview groupName={getGroupDraft(group).name} />;
        }

        if (activeDrag.type !== "category") {
            return null;
        }

        const category = categoriesById.get(activeDrag.id);

        if (!category) {
            return null;
        }

        const draft = getCategoryDraft(category);

        return (
            <CategoryDragPreview
                categoryName={draft.name}
                defaultAssignedValue={draft.defaultAssignedValue}
                isSystemManaged={
                    category.systemCategoryKey === "startingBalances"
                }
            />
        );
    }

    function buildSavePayload(input?: {
        categoryDrafts?: Record<string, GlobalPlanCategoryDraft>;
        categoryOrderByGroupId?: Record<string, string[]>;
        groupDrafts?: Record<string, GlobalPlanGroupDraft>;
        groupOrder?: string[];
    }) {
        const resolvedCategoryDrafts = input?.categoryDrafts ?? categoryDrafts;
        const resolvedCategoryOrderByGroupId =
            input?.categoryOrderByGroupId ?? categoryOrderByGroupId;
        const resolvedGroupDrafts = input?.groupDrafts ?? groupDrafts;
        const resolvedGroupOrder = input?.groupOrder ?? groupOrder;

        return {
            groups: resolvedGroupOrder
                .map((groupId, index) => {
                    const group = groupsById.get(groupId);

                    if (!group) {
                        return null;
                    }

                    return {
                        groupId: group.groupId,
                        name:
                            resolvedGroupDrafts[group.groupId]?.name ??
                            group.name,
                        sortOrder: index,
                        status: group.status,
                    };
                })
                .filter(
                    (
                        group,
                    ): group is {
                        groupId: string;
                        name: string;
                        sortOrder: number;
                        status: "active" | "archived";
                    } => Boolean(group),
                ),
            categories: resolvedGroupOrder.flatMap((groupId) =>
                (resolvedCategoryOrderByGroupId[groupId] ?? [])
                    .map((categoryId, index) => {
                        const category = categoriesById.get(categoryId);

                        if (!category) {
                            return null;
                        }

                        const draft =
                            resolvedCategoryDrafts[category.categoryId] ??
                            createCategoryDraft(category);

                        return {
                            allocationCadence: draft.allocationCadence,
                            allocationStartMonth: draft.allocationStartMonth,
                            categoryId: category.categoryId,
                            categoryType: draft.categoryType,
                            defaultAssignedCents: parseUsdToCents(
                                draft.defaultAssignedValue,
                            ),
                            groupId,
                            isIncomeCategory: category.isIncomeCategory,
                            name: draft.name,
                            sortOrder: index,
                            systemCategoryKey: category.systemCategoryKey,
                        };
                    })
                    .filter(
                        (
                            category,
                        ): category is {
                            allocationCadence: BudgetCategoryAllocationCadence;
                            allocationStartMonth: number;
                            categoryId: string;
                            categoryType: BudgetCategoryType;
                            defaultAssignedCents: number;
                            groupId: string;
                            isIncomeCategory: boolean;
                            name: string;
                            sortOrder: number;
                            systemCategoryKey: "startingBalances" | undefined;
                        } => Boolean(category),
                    ),
            ),
        };
    }

    function createOptimisticPlanChanges(
        payload: ReturnType<typeof buildSavePayload>,
    ): OptimisticWorkspaceChange[] {
        const changedAtDate = new Date();
        const updatedAt = changedAtDate.toISOString();
        const batchId = `optimistic:budget-plan:${updatedAt}`;
        const groupRecordsById = new Map(
            snapshot.budgetGroups.map((group) => [group.groupId, group]),
        );
        const categoryRecordsById = new Map(
            snapshot.budgetCategories.map((category) => [
                category.categoryId,
                category,
            ]),
        );

        return [
            ...payload.groups.flatMap((group) => {
                const currentGroup = groupRecordsById.get(group.groupId);

                if (!currentGroup) {
                    return [];
                }

                return [
                    createOptimisticWorkspaceUpsert({
                        batchId,
                        changedAt: changedAtDate,
                        entityId: group.groupId,
                        entityType: "budgetGroup",
                        record: {
                            ...currentGroup,
                            ...group,
                            updatedAt,
                        },
                    }),
                ];
            }),
            ...payload.categories.flatMap((category) => {
                const currentCategory = categoryRecordsById.get(
                    category.categoryId,
                );

                if (!currentCategory) {
                    return [];
                }

                return [
                    createOptimisticWorkspaceUpsert({
                        batchId,
                        changedAt: changedAtDate,
                        entityId: category.categoryId,
                        entityType: "budgetCategory",
                        record: {
                            ...currentCategory,
                            ...category,
                            updatedAt,
                        },
                    }),
                ];
            }),
        ];
    }

    function savePlan(
        input?: Parameters<typeof buildSavePayload>[0],
        successMessage = "Budget plan saved.",
    ) {
        try {
            const payload = buildSavePayload(input);
            const changes = createOptimisticPlanChanges(payload);

            void executeWorkspaceCommand({
                activity: {
                    completedLabel: successMessage,
                    pendingLabel: "Saving budget plan…",
                },
                optimisticChanges: changes,
                request: () =>
                    fetch("/api/budget/plan", {
                        method: "PUT",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(payload),
                    }),
                onError: async (error) => {
                    setCategoryDrafts(createCategoryDrafts(categories));
                    setGroupDrafts(createGroupDrafts(groups));
                    setGroupOrder(createGroupOrder(groups));
                    setCategoryOrderByGroupId(
                        createCategoryOrderByGroupId(groups, categories),
                    );
                    setEditCategoryId(null);
                    setEditGroupId(null);
                    notifyError({
                        message: `${error instanceof Response ? await parseApiErrorMessage(error, "Unable to save the budget plan.") : error instanceof Error ? error.message : "Unable to save the budget plan."} Save failed. The latest saved data has been restored.`,
                        title: "Budget plan could not be saved.",
                    });
                },
            });
        } catch (error) {
            notifyError({
                message: `${error instanceof Error ? error.message : "Unable to save the budget plan."} The last saved reusable plan is unchanged.`,
                title: "Budget plan could not be saved.",
            });
        }
    }

    function applySelectedCategoryType(categoryType: BudgetCategoryType) {
        if (selectedCategoryIds.length === 0) {
            return;
        }

        const nextCategoryDrafts = { ...categoryDrafts };

        for (const categoryId of selectedCategoryIds) {
            const category = categoriesById.get(categoryId);

            if (!category || category.systemCategoryKey === "startingBalances") {
                continue;
            }

            nextCategoryDrafts[categoryId] = {
                ...(nextCategoryDrafts[categoryId] ??
                    createCategoryDraft(category)),
                categoryType,
            };
        }

        setCategoryDrafts(nextCategoryDrafts);
        clearCategorySelection();
        savePlan(
            { categoryDrafts: nextCategoryDrafts },
            `${selectedCategoryIds.length} categories updated.`,
        );
    }

    function applySelectedCategorySchedule(
        allocationCadence: BudgetCategoryAllocationCadence,
    ) {
        if (selectedCategoryIds.length === 0) {
            return;
        }

        const nextCategoryDrafts = { ...categoryDrafts };

        for (const categoryId of selectedCategoryIds) {
            const category = categoriesById.get(categoryId);

            if (!category || category.systemCategoryKey === "startingBalances") {
                continue;
            }

            nextCategoryDrafts[categoryId] = {
                ...(nextCategoryDrafts[categoryId] ??
                    createCategoryDraft(category)),
                allocationCadence,
            };
        }

        setCategoryDrafts(nextCategoryDrafts);
        clearCategorySelection();
        savePlan(
            { categoryDrafts: nextCategoryDrafts },
            `${selectedCategoryIds.length} categories updated.`,
        );
    }

    async function loadDeletePreview(category: {
        categoryId: string;
        name: string;
    }) {
        setDeleteCategory(category);
        setDeleteImpact(null);
        setDeletePreviewError(null);
        setIsLoadingDeletePreview(true);

        try {
            const response = await fetch(
                `/api/budget/categories/${category.categoryId}`,
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to load delete preview.",
                    ),
                );
            }

            const impact = (await response.json()) as DeletionImpactSummary;
            setDeleteImpact(impact);
        } catch (previewError) {
            setDeletePreviewError(
                previewError instanceof Error
                    ? previewError.message
                    : "Unable to load delete preview.",
            );
        } finally {
            setIsLoadingDeletePreview(false);
        }
    }

    async function deleteCategoryNow() {
        if (!deleteCategory || !deleteImpact) {
            return;
        }

        setPendingDeleteCategoryId(deleteCategory.categoryId);
        setDeletePreviewError(null);
        const activity = startActivity({
            completedLabel: "Category deleted.",
            pendingLabel: "Deleting category…",
        });

        try {
            const response = await fetch(
                `/api/budget/categories/${deleteCategory.categoryId}`,
                {
                    method: "DELETE",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        previewRevision: deleteImpact.previewRevision,
                    }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to delete category.",
                    ),
                );
            }

            setDeleteCategory(null);
            setDeleteImpact(null);
            await reconcileFullWorkspaceMutation(response);
            activity.complete();
        } catch (deleteError) {
            activity.fail();
            setDeletePreviewError(
                deleteError instanceof Error
                    ? deleteError.message
                    : "Unable to delete category.",
            );
        } finally {
            setPendingDeleteCategoryId(null);
        }
    }

    return (
        <div className="grid gap-4">
            <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="grid gap-1">
                        <p className={typographyClassNames.eyebrow}>
                            Budget plan
                        </p>
                    </div>
                    <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                        {isReordering ? (
                            <>
                                <button
                                    type="button"
                                    onClick={cancelReorder}
                                    disabled={isSubmitting}
                                    className={controlClassNames.secondaryActionCompact}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={saveReorder}
                                    disabled={isSubmitting}
                                    className={controlClassNames.primaryActionCompact}
                                >
                                    Save order
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setIsReordering(true)}
                                    disabled={isSubmitting || isSubmittingGroup}
                                    className={controlClassNames.secondaryActionCompact}
                                >
                                    Reorder
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCreateGroupDialogOpen(true)}
                                    disabled={isSubmitting || isSubmittingGroup}
                                    className={`${controlClassNames.primaryActionCompact} inline-flex items-center gap-2`}
                                >
                                    <FontAwesomeIcon
                                        aria-hidden="true"
                                        icon={faPlus}
                                    />
                                    Add group
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <DndContext
                    id="budget-plan-dnd"
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragCancel={() => setActiveDrag(null)}
                    onDragEnd={handleDragEnd}
                    onDragStart={handleDragStart}
                >
                    <SortableContext
                        id="budget-plan-groups"
                        items={groupOrder.map(createGroupDragId)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="grid gap-4">
                            {groupOrder.map((groupId) => {
                                const group = groupsById.get(groupId);

                                if (!group) {
                                    return null;
                                }

                                const groupDraft = getGroupDraft(group);
                                const categoryIds =
                                    categoryOrderByGroupId[group.groupId] ?? [];

                                return (
                                    <SortableGroupSection
                                        key={group.groupId}
                                        group={group}
                                        groupName={groupDraft.name}
                                        isCollapsed={collapsedGroupIds.has(
                                            group.groupId,
                                        )}
                                        isGroupSelected={
                                            categoryIds.length > 0 &&
                                            categoryIds.every((categoryId) =>
                                                selectedCategoryIdSet.has(
                                                    categoryId,
                                                ),
                                            )
                                        }
                                        isReordering={isReordering}
                                        isSubmitting={
                                            isSubmitting ||
                                            isSubmittingCategory ||
                                            isSubmittingGroup
                                        }
                                        onAddCategory={() =>
                                            setCreateCategoryGroupId(
                                                group.groupId,
                                            )
                                        }
                                        onEditGroup={() =>
                                            setEditGroupId(group.groupId)
                                        }
                                        onToggleCollapsed={() =>
                                            toggleGroupCollapsed(group.groupId)
                                        }
                                        onToggleGroupSelection={(event) =>
                                            toggleGroupCategorySelection(
                                                event,
                                                categoryIds,
                                            )
                                        }
                                    >
                                        <div className="overflow-x-auto">
                                            <table className="min-w-[52rem] w-full table-fixed border-collapse text-left text-sm">
                                                <colgroup>
                                                    <col className="w-12" />
                                                    <col />
                                                    <col className="w-32" />
                                                    <col className="w-40" />
                                                    <col className="w-36" />
                                                    {!isReordering ? (
                                                        <col className="w-44" />
                                                    ) : null}
                                                </colgroup>
                                                <thead>
                                                    <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                                                        {isReordering ? (
                                                            <th
                                                                className="w-12 px-4 py-2 font-medium"
                                                                aria-label="Reorder"
                                                            />
                                                        ) : (
                                                            <th
                                                                className="w-12 px-4 py-2 font-medium"
                                                                aria-label="Selection"
                                                            />
                                                        )}
                                                        <th className="px-4 py-2 font-medium">
                                                            Category
                                                        </th>
                                                        <th className="px-4 py-2 text-right font-medium">
                                                            Type
                                                        </th>
                                                        <th className="px-4 py-2 text-right font-medium">
                                                            Schedule
                                                        </th>
                                                        <th className="px-4 py-2 text-right font-medium">
                                                            Amount
                                                        </th>
                                                        {!isReordering ? (
                                                            <th className="px-4 py-2 text-right font-medium">
                                                                Actions
                                                            </th>
                                                        ) : null}
                                                    </tr>
                                                </thead>
                                                <SortableContext
                                                    id={`budget-plan-categories-${group.groupId}`}
                                                    items={categoryIds.map(
                                                        createCategoryDragId,
                                                    )}
                                                    strategy={
                                                        verticalListSortingStrategy
                                                    }
                                                >
                                                    <DroppableCategoryBody
                                                        groupId={group.groupId}
                                                        isReordering={isReordering}
                                                    >
                                                        {categoryIds.length ===
                                                        0 ? (
                                                            <tr>
                                                                <td
                                                                    colSpan={
                                                                        isReordering
                                                                            ? 5
                                                                            : 6
                                                                    }
                                                                    className="px-4 py-8 text-center text-[var(--color-muted)]"
                                                                >
                                                                    No
                                                                    categories
                                                                    in this
                                                                    group.
                                                                </td>
                                                            </tr>
                                                        ) : null}
                                                        {categoryIds.map(
                                                            (categoryId) => {
                                                                const category =
                                                                    categoriesById.get(
                                                                        categoryId,
                                                                    );

                                                                if (!category) {
                                                                    return null;
                                                                }

                                                                const isSystemManaged =
                                                                    category.systemCategoryKey ===
                                                                    "startingBalances";
                                                                const draft =
                                                                    getCategoryDraft(
                                                                        category,
                                                                    );

                                                                return (
                                                                    <SortableCategoryRow
                                                                        key={
                                                                            category.categoryId
                                                                        }
                                                                        category={
                                                                            category
                                                                        }
                                                                        categoryName={
                                                                            draft.name
                                                                        }
                                                                        isReordering={
                                                                            isReordering
                                                                        }
                                                                        isSelected={selectedCategoryIdSet.has(
                                                                            category.categoryId,
                                                                        )}
                                                                        onSelect={(
                                                                            input,
                                                                        ) =>
                                                                            selectCategory(
                                                                                category.categoryId,
                                                                                input,
                                                                            )
                                                                        }
                                                                    >
                                                                        <td className="px-4 py-2 align-middle font-medium text-[var(--color-ink)]">
                                                                            <div className="grid gap-1">
                                                                                <span>
                                                                                    {
                                                                                        draft.name
                                                                                    }
                                                                                </span>
                                                                                {isSystemManaged ? (
                                                                                    <span className="text-xs font-normal text-[var(--color-muted)]">
                                                                                        System
                                                                                        managed
                                                                                    </span>
                                                                                ) : null}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-2 text-right align-middle">
                                                                            <span className="inline-flex items-center justify-end gap-2 text-xs text-[var(--color-muted)]">
                                                                                <FontAwesomeIcon
                                                                                    aria-hidden="true"
                                                                                    icon={
                                                                                        draft.categoryType ===
                                                                                        "savings"
                                                                                            ? faPiggyBank
                                                                                            : faCartShopping
                                                                                    }
                                                                                />
                                                                                {formatBudgetCategoryType(
                                                                                    draft.categoryType,
                                                                                )}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-4 py-2 text-right align-middle">
                                                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                                                <FontAwesomeIcon
                                                                                    aria-hidden="true"
                                                                                    className="text-[var(--color-muted)]"
                                                                                    icon={
                                                                                        draft.allocationCadence ===
                                                                                        "yearly"
                                                                                            ? faCalendarDays
                                                                                            : faCalendar
                                                                                    }
                                                                                />
                                                                                <span className="text-xs text-[var(--color-muted)]">
                                                                                    {formatAllocationSchedule(
                                                                                        draft,
                                                                                    )}
                                                                                </span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-2 text-right align-middle">
                                                                            <InlineEditableField
                                                                                ariaLabel={`Amount for ${draft.name}`}
                                                                                displayClassName={`w-32 justify-end text-right ${getDefaultAssignedToneClassName(draft.defaultAssignedValue)}`}
                                                                                displayValue={
                                                                                    <MoneyAmount
                                                                                        cents={parseDefaultAssignedCents(
                                                                                            draft.defaultAssignedValue,
                                                                                        )}
                                                                                    />
                                                                                }
                                                                                inputClassName={`w-32 text-right ${getDefaultAssignedToneClassName(draft.defaultAssignedValue)}`}
                                                                                inputMode="decimal"
                                                                                name={`defaultAssigned:${category.categoryId}`}
                                                                                valueKind="money"
                                                                                value={
                                                                                    draft.defaultAssignedValue
                                                                                }
                                                                                onChange={(
                                                                                    value,
                                                                                ) => {
                                                                                    updateCategoryDraft(
                                                                                        category,
                                                                                        {
                                                                                            defaultAssignedValue:
                                                                                                value,
                                                                                        },
                                                                                    );
                                                                                }}
                                                                                onCommit={(
                                                                                    value,
                                                                                ) => {
                                                                                    const nextCategoryDrafts =
                                                                                        {
                                                                                            ...categoryDrafts,
                                                                                            [category.categoryId]:
                                                                                                {
                                                                                                    ...draft,
                                                                                                    defaultAssignedValue:
                                                                                                        value,
                                                                                                },
                                                                                        };
                                                                                    setCategoryDrafts(
                                                                                        nextCategoryDrafts,
                                                                                    );
                                                                                    void savePlan(
                                                                                        {
                                                                                            categoryDrafts:
                                                                                                nextCategoryDrafts,
                                                                                        },
                                                                                        "Budget plan saved.",
                                                                                    );
                                                                                }}
                                                                                disabled={
                                                                                    isSubmitting ||
                                                                                    isReordering ||
                                                                                    isSystemManaged
                                                                                }
                                                                            />
                                                                        </td>
                                                                        {!isReordering ? (
                                                                            <td className="px-4 py-2 align-middle">
                                                                                <div className="flex justify-end gap-2">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            setEditCategoryId(
                                                                                                category.categoryId,
                                                                                            )
                                                                                        }
                                                                                        disabled={
                                                                                            isSubmitting ||
                                                                                            isSystemManaged
                                                                                        }
                                                                                        className={
                                                                                            compactBudgetPlanActionClassName
                                                                                        }
                                                                                    >
                                                                                        <FontAwesomeIcon
                                                                                            aria-hidden="true"
                                                                                            icon={
                                                                                                faPenToSquare
                                                                                            }
                                                                                        />
                                                                                        Edit
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            void loadDeletePreview(
                                                                                                {
                                                                                                    categoryId:
                                                                                                        category.categoryId,
                                                                                                    name: draft.name,
                                                                                                },
                                                                                            );
                                                                                        }}
                                                                                        disabled={
                                                                                            isSubmitting ||
                                                                                            isLoadingDeletePreview ||
                                                                                            pendingDeleteCategoryId ===
                                                                                                category.categoryId ||
                                                                                            isSystemManaged
                                                                                        }
                                                                                        className={
                                                                                            compactBudgetPlanDangerActionClassName
                                                                                        }
                                                                                    >
                                                                                        {pendingDeleteCategoryId ===
                                                                                        category.categoryId
                                                                                            ? "Deleting..."
                                                                                            : isSystemManaged
                                                                                              ? "Locked"
                                                                                              : "Delete"}
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                        ) : null}
                                                                    </SortableCategoryRow>
                                                                );
                                                            },
                                                        )}
                                                    </DroppableCategoryBody>
                                                </SortableContext>
                                            </table>
                                        </div>
                                    </SortableGroupSection>
                                );
                            })}
                        </div>
                    </SortableContext>
                    <DragOverlay zIndex={1000}>
                        {renderDragOverlay()}
                    </DragOverlay>
                </DndContext>

                <SelectionActionBar
                    ariaLabel="Selected category actions"
                    detail="Choose an action to apply to every selected category."
                    onClose={clearCategorySelection}
                    open={!isReordering && selectedCategoryCount > 0}
                    title={
                        selectedCategoryCount === 1
                            ? "1 category selected"
                            : `${selectedCategoryCount} categories selected`
                    }
                    titleClearsSelection={selectedCategoryCount > 1}
                >
                    <select
                        aria-label="Category type actions"
                        value={selectedCategoryTypeAction}
                        onChange={(event) => {
                            const action = event.target.value;
                            setSelectedCategoryTypeAction("");

                            if (action === "spending" || action === "savings") {
                                applySelectedCategoryType(action);
                            }
                        }}
                        className="border border-[var(--color-action-bar-border)] bg-[var(--color-action-bar-control)] px-3 py-2 text-sm font-medium text-[var(--color-action-bar-ink)] transition hover:bg-[var(--color-action-bar-control-hover)]"
                    >
                        <option value="" disabled>
                            Category type
                        </option>
                        <option value="spending">Set type to Spending</option>
                        <option value="savings">Set type to Savings</option>
                    </select>
                    <select
                        aria-label="Schedule actions"
                        value={selectedCategoryScheduleAction}
                        onChange={(event) => {
                            const action = event.target.value;
                            setSelectedCategoryScheduleAction("");

                            if (action === "monthly" || action === "yearly") {
                                applySelectedCategorySchedule(action);
                            }
                        }}
                        className="border border-[var(--color-action-bar-border)] bg-[var(--color-action-bar-control)] px-3 py-2 text-sm font-medium text-[var(--color-action-bar-ink)] transition hover:bg-[var(--color-action-bar-control-hover)]"
                    >
                        <option value="" disabled>
                            Schedule
                        </option>
                        <option value="monthly">Set schedule to Monthly</option>
                        <option value="yearly">Set schedule to Yearly</option>
                    </select>
                </SelectionActionBar>
            </div>

            {editingCategory ? (
                <CategoryEditDialog
                    category={editingCategory}
                    draft={{
                        allocationCadence: getCategoryDraft(editingCategory)
                            .allocationCadence,
                        allocationStartMonth: getCategoryDraft(editingCategory)
                            .allocationStartMonth,
                        categoryType: getCategoryDraft(editingCategory)
                            .categoryType,
                        defaultAssignedValue: getCategoryDraft(editingCategory)
                            .defaultAssignedValue,
                        name: getCategoryDraft(editingCategory).name,
                    }}
                    isSubmitting={isSubmitting}
                    onApply={(draft) => {
                        const nextCategoryDrafts = {
                            ...categoryDrafts,
                            [editingCategory.categoryId]: {
                                ...getCategoryDraft(editingCategory),
                                allocationCadence: draft.allocationCadence,
                                allocationStartMonth: draft.allocationStartMonth,
                                categoryType: draft.categoryType,
                                defaultAssignedValue: draft.defaultAssignedValue,
                                name: draft.name,
                            },
                        };
                        setCategoryDrafts(nextCategoryDrafts);
                        setEditCategoryId(null);
                        void savePlan(
                            { categoryDrafts: nextCategoryDrafts },
                            "Category saved.",
                        );
                    }}
                    onClose={() => setEditCategoryId(null)}
                />
            ) : null}

            {isCreateGroupDialogOpen ? (
                <GroupDialog
                    isSubmitting={isSubmittingGroup}
                    submitLabel="Save group"
                    title="Add group"
                    onClose={() => {
                        if (!isSubmittingGroup) {
                            setIsCreateGroupDialogOpen(false);
                        }
                    }}
                    onSubmit={(name) => {
                        void createGroup(name);
                    }}
                />
            ) : null}

            {editingGroup ? (
                <GroupDialog
                    initialName={getGroupDraft(editingGroup).name}
                    isSubmitting={isSubmitting}
                    submitLabel="Apply changes"
                    title="Edit group"
                    onClose={() => setEditGroupId(null)}
                    onSubmit={(name) => {
                        const nextGroupDrafts = {
                            ...groupDrafts,
                            [editingGroup.groupId]: {
                                ...getGroupDraft(editingGroup),
                                name,
                            },
                        };
                        setGroupDrafts(nextGroupDrafts);
                        setEditGroupId(null);
                        void savePlan(
                            { groupDrafts: nextGroupDrafts },
                            "Group saved.",
                        );
                    }}
                />
            ) : null}

            {createCategoryGroup ? (
                <CategoryCreateDialog
                    groupName={getGroupDraft(createCategoryGroup).name}
                    isSubmitting={isSubmittingCategory}
                    onClose={() => {
                        if (!isSubmittingCategory) {
                            setCreateCategoryGroupId(null);
                        }
                    }}
                    onSubmit={(name) => {
                        void createCategory({
                            groupId: createCategoryGroup.groupId,
                            name,
                        });
                    }}
                />
            ) : null}

            <DeleteConfirmationDialog
                open={deleteCategory !== null}
                impact={deleteImpact}
                errorMessage={deletePreviewError}
                isLoading={isLoadingDeletePreview}
                isSubmitting={
                    deleteCategory !== null &&
                    pendingDeleteCategoryId === deleteCategory.categoryId
                }
                onRefresh={
                    deleteCategory
                        ? () => {
                              void loadDeletePreview(deleteCategory);
                          }
                        : undefined
                }
                onConfirm={() => {
                    void deleteCategoryNow();
                }}
                onClose={() => {
                    if (pendingDeleteCategoryId) {
                        return;
                    }

                    setDeleteCategory(null);
                    setDeleteImpact(null);
                    setDeletePreviewError(null);
                }}
            />
        </div>
    );
}
