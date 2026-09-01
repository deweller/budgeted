import type { ComboboxSelectOption } from "@/components/shared/combobox-select";
import type {
    WorkspaceBudgetCategoryRecord,
    WorkspaceBudgetGroupRecord,
} from "@/lib/workspace/sync-types";
import { formatUsd } from "@/lib/formatting/money";
import { getMoneyToneClassName } from "@/lib/theme/theme-recipes";

type CategoryComboboxOptionCategory = Pick<
    WorkspaceBudgetCategoryRecord,
    "categoryId" | "name"
> &
    Partial<Pick<WorkspaceBudgetCategoryRecord, "groupId" | "sortOrder">>;

type CategoryComboboxOptionGroup = Pick<
    WorkspaceBudgetGroupRecord,
    "groupId" | "name" | "sortOrder" | "status"
>;

type BuildGroupedCategoryComboboxOptionsInput<Category> = {
    categories: Category[];
    getDescription?: (category: Category) => string | undefined;
    getDescriptionClassName?: (category: Category) => string | undefined;
    groups: CategoryComboboxOptionGroup[];
    getValue: (category: Category) => string;
};

const fallbackCategoryGroupLabel = "Categories";
const fallbackSortOrder = Number.MAX_SAFE_INTEGER;

export function sortCategoriesLikeTransactionChooser<
    Category extends CategoryComboboxOptionCategory,
>(categories: Category[], groups: CategoryComboboxOptionGroup[]) {
    const activeGroupById = new Map(
        groups
            .filter((group) => group.status === "active")
            .map((group) => [group.groupId, group]),
    );

    function getGroup(category: Category) {
        return category.groupId
            ? activeGroupById.get(category.groupId)
            : undefined;
    }

    return [...categories].sort((left, right) => {
        const leftGroup = getGroup(left);
        const rightGroup = getGroup(right);

        return (
            (leftGroup?.sortOrder ?? fallbackSortOrder) -
                (rightGroup?.sortOrder ?? fallbackSortOrder) ||
            (leftGroup?.name ?? fallbackCategoryGroupLabel).localeCompare(
                rightGroup?.name ?? fallbackCategoryGroupLabel,
            ) ||
            (left.sortOrder ?? fallbackSortOrder) -
                (right.sortOrder ?? fallbackSortOrder) ||
            left.name.localeCompare(right.name)
        );
    });
}

export function buildGroupedCategoryComboboxOptions<
    Category extends CategoryComboboxOptionCategory,
>({
    categories,
    getDescription,
    getDescriptionClassName,
    getValue,
    groups,
}: BuildGroupedCategoryComboboxOptionsInput<Category>): ComboboxSelectOption[] {
    const activeGroupById = new Map(
        groups
            .filter((group) => group.status === "active")
            .map((group) => [group.groupId, group]),
    );

    return sortCategoriesLikeTransactionChooser(categories, groups).map(
        (category) => {
            const group = category.groupId
                ? activeGroupById.get(category.groupId)
                : undefined;

            return {
                group: group?.name ?? fallbackCategoryGroupLabel,
                description: getDescription?.(category),
                descriptionClassName: getDescriptionClassName?.(category),
                label: category.name,
                value: getValue(category),
            };
        },
    );
}

export function buildCurrentMonthCategoryBalanceOptions<
    Category extends CategoryComboboxOptionCategory,
>(input: {
    balanceByCategoryId: ReadonlyMap<string, number>;
    categories: Category[];
    getValue: (category: Category) => string;
    groups: CategoryComboboxOptionGroup[];
}): ComboboxSelectOption[] {
    return buildGroupedCategoryComboboxOptions({
        categories: input.categories,
        getDescription: (category) => {
            const balanceCents = input.balanceByCategoryId.get(
                category.categoryId,
            );

            return balanceCents === undefined
                ? undefined
                : `Balance: ${formatUsd(balanceCents)}`;
        },
        getDescriptionClassName: (category) => {
            const balanceCents = input.balanceByCategoryId.get(
                category.categoryId,
            );

            return balanceCents === undefined
                ? undefined
                : getMoneyToneClassName(balanceCents);
        },
        getValue: input.getValue,
        groups: input.groups,
    });
}
