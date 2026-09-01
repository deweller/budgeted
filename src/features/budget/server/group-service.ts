import { ulid } from "ulid";

import type { GroupFormInput } from "@/features/budget/models/group-form";
import { createWorkspaceUpsertChange } from "@/features/workspace/server/workspace-change-builder";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { compareBudgetItemsBySortOrder } from "@/modules/budgeting";

export async function listBudgetGroups(ledgerId: string) {
    const { entities } = getBudgetedSchema();
    const groups = await queryAllPages(
        entities.budgetGroups.query.byGroup({ ledgerId }),
        { consistent: true },
    );

    return groups.sort(compareBudgetItemsBySortOrder);
}

async function findBudgetGroupRecord(ledgerId: string, groupId: string) {
    const { entities } = getBudgetedSchema();
    const result = await entities.budgetGroups
        .get({ ledgerId, groupId })
        .go({ consistent: true });

    return result.data ?? null;
}

export async function getBudgetGroupRecord(ledgerId: string, groupId: string) {
    const group = await findBudgetGroupRecord(ledgerId, groupId);

    if (!group) {
        throw new HttpError(
            404,
            "group_missing",
            "The budget group could not be found.",
        );
    }

    return group;
}

export async function upsertBudgetGroup(
    ledgerId: string,
    input: GroupFormInput & { groupId?: string },
) {
    const { entities } = getBudgetedSchema();
    const existing = input.groupId
        ? await findBudgetGroupRecord(ledgerId, input.groupId)
        : null;
    const groups = await listBudgetGroups(ledgerId);
    const now = new Date().toISOString();
    const groupId = existing?.groupId ?? input.groupId ?? ulid();
    const record = {
        groupId,
        ledgerId,
        name: input.name.trim(),
        status: input.status,
        sortOrder: input.sortOrder ?? existing?.sortOrder ?? groups.length,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };

    await entities.budgetGroups.upsert(record).go();

    return record;
}

export async function upsertBudgetGroupWithWorkspaceChanges(
    ledgerId: string,
    input: GroupFormInput & { groupId?: string },
) {
    const existing = input.groupId
        ? await findBudgetGroupRecord(ledgerId, input.groupId)
        : null;
    const group = await upsertBudgetGroup(ledgerId, input);

    return {
        group,
        workspaceChanges: [
            createWorkspaceUpsertChange({
                entityId: group.groupId,
                entityType: "budgetGroup",
                previousRecord: existing,
                record: group,
            }),
        ],
    };
}
