import * as XLSX from "xlsx";

import { importLedgerExport, buildLedgerExportFile } from "@/features/utilities/server/ledger-transfer-service";
import { HttpError } from "@/lib/api/errors";
import { parseUsdToCents } from "@/lib/formatting/money";
import {
    normalizeBudgetCategoryAllocationCadence,
    normalizeBudgetCategoryAllocationStartMonth,
} from "@/modules/budgeting/allocation-schedule";
import { normalizeBudgetCategoryType } from "@/modules/budgeting/category-type";
import type { LedgerExportFile } from "@/features/utilities/models/ledger-transfer";

const workbookMimeType =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const groupSheetName = "Budget Groups";
const categorySheetName = "Budget Categories";

type CurrentWorkspaceUser = Parameters<typeof buildLedgerExportFile>[0];
type SpreadsheetRow = Record<string, unknown>;

type BudgetPlanWorkbookDownload = {
    content: Buffer;
    contentType: string;
    filename: string;
};

function slugifyFilenameSegment(value: string) {
    return (
        value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "ledger"
    );
}

function formatExportTimestamp(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "export";
    }

    return date.toISOString().slice(0, 10);
}

function createEmptyTransferRecords(): LedgerExportFile["records"] {
    return {
        accounts: [],
        allocationFundingSources: [],
        amazonOrderIntegrations: [],
        amazonOrderSyncRuns: [],
        amazonOrders: [],
        budgetAllocations: [],
        budgetCategories: [],
        budgetGroups: [],
        budgetPeriods: [],
        ledgerPostings: [],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionTemplates: [],
        transactionImportActivities: [],
        transactionLines: [],
        transactions: [],
        venmoAccountMappings: [],
        venmoIntegrations: [],
    };
}

function toText(value: unknown) {
    return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function requireText(input: {
    column: string;
    row: SpreadsheetRow;
    rowNumber: number;
    sheetName: string;
}) {
    const value = toText(input.row[input.column]);

    if (!value) {
        throw new HttpError(
            422,
            "budget_plan_workbook_required_value",
            `${input.sheetName} row ${input.rowNumber} requires ${input.column}.`,
        );
    }

    return value;
}

function parseGroupIdReference(value: string) {
    const match = value.match(/\s+\[([^\]]+)\]\s*$/);

    return (match?.[1] ?? value).trim();
}

function requireGroupId(input: {
    row: SpreadsheetRow;
    rowNumber: number;
    sheetName: string;
}) {
    const value = parseGroupIdReference(
        requireText({
            column: "Group ID",
            row: input.row,
            rowNumber: input.rowNumber,
            sheetName: input.sheetName,
        }),
    );

    if (!value) {
        throw new HttpError(
            422,
            "budget_plan_workbook_required_value",
            `${input.sheetName} row ${input.rowNumber} requires Group ID.`,
        );
    }

    return value;
}

function parseStatus(value: unknown, defaultValue: "active" | "archived") {
    const normalized = toText(value).toLowerCase();

    if (!normalized) {
        return defaultValue;
    }

    if (normalized === "active" || normalized === "archived") {
        return normalized;
    }

    throw new HttpError(
        422,
        "budget_plan_workbook_invalid_status",
        "Budget plan statuses must be Active or Archived.",
    );
}

function parseBoolean(value: unknown, defaultValue = false) {
    const normalized = toText(value).toLowerCase();

    if (!normalized) {
        return defaultValue;
    }

    if (["true", "yes", "1"].includes(normalized)) {
        return true;
    }

    if (["false", "no", "0"].includes(normalized)) {
        return false;
    }

    throw new HttpError(
        422,
        "budget_plan_workbook_invalid_boolean",
        "Budget plan boolean values must be Yes or No.",
    );
}

function parseOptionalInteger(value: unknown) {
    const text = toText(value);

    if (!text) {
        return undefined;
    }

    const parsed = Number(text);

    if (!Number.isInteger(parsed)) {
        throw new HttpError(
            422,
            "budget_plan_workbook_invalid_number",
            "Budget plan number fields must be whole numbers.",
        );
    }

    return parsed;
}

function parseDefaultAssignedCents(value: unknown) {
    const text = toText(value).replace(/[$,]/g, "");

    if (!text) {
        return 0;
    }

    try {
        return parseUsdToCents(text);
    } catch {
        throw new HttpError(
            422,
            "budget_plan_workbook_invalid_amount",
            "Default Amount must be a valid dollar amount.",
        );
    }
}

function requireSheet(workbook: XLSX.WorkBook, sheetName: string) {
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
        throw new HttpError(
            422,
            "budget_plan_workbook_sheet_missing",
            `The workbook must contain a ${sheetName} sheet.`,
        );
    }

    return XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet, {
        defval: "",
        raw: true,
    });
}

function buildWorkbookExportFile(
    workbook: XLSX.WorkBook,
    sourceLedger: LedgerExportFile["sourceLedger"],
): LedgerExportFile {
    const groupRows = requireSheet(workbook, groupSheetName);
    const categoryRows = requireSheet(workbook, categorySheetName);
    const now = new Date().toISOString();
    const groups = groupRows.map((row, index) => ({
        createdAt: now,
        groupId: requireText({
            column: "Group ID",
            row,
            rowNumber: index + 2,
            sheetName: groupSheetName,
        }),
        ledgerId: sourceLedger.ledgerId,
        name: requireText({
            column: "Group Name",
            row,
            rowNumber: index + 2,
            sheetName: groupSheetName,
        }),
        sortOrder: index,
        status: parseStatus(row.Status, "active"),
        updatedAt: now,
    }));
    const groupIds = new Set(groups.map((group) => group.groupId));
    const categories = categoryRows.map((row, index) => {
        const groupId = requireGroupId({
            row,
            rowNumber: index + 2,
            sheetName: categorySheetName,
        });

        if (!groupIds.has(groupId)) {
            throw new HttpError(
                422,
                "budget_plan_workbook_group_missing",
                `Budget Categories row ${index + 2} references a group that is not in Budget Groups.`,
            );
        }

        const categoryId = requireText({
            column: "Category ID",
            row,
            rowNumber: index + 2,
            sheetName: categorySheetName,
        });
        const allocationCadence = normalizeBudgetCategoryAllocationCadence(
            toText(row.Schedule).toLowerCase(),
        );

        return {
            allocationCadence,
            allocationStartMonth:
                allocationCadence === "yearly"
                    ? normalizeBudgetCategoryAllocationStartMonth(
                          parseOptionalInteger(row["Start Month"]),
                      )
                    : 1,
            autoAssignSourceEnabled: parseBoolean(
                row["Auto Assign Source"],
            ),
            autoAssignSourceSortOrder: parseOptionalInteger(
                row["Auto Assign Sort Order"],
            ),
            categoryId,
            categoryType: normalizeBudgetCategoryType(
                toText(row["Category Type"]).toLowerCase(),
            ),
            createdAt: now,
            defaultAssignedCents: parseDefaultAssignedCents(
                row["Default Amount"],
            ),
            groupId,
            isIncomeCategory: parseBoolean(row["Income Category"]),
            ledgerAccountId: `cat_${categoryId}`,
            ledgerId: sourceLedger.ledgerId,
            name: requireText({
                column: "Category Name",
                row,
                rowNumber: index + 2,
                sheetName: categorySheetName,
            }),
            sortOrder: index,
            status: parseStatus(row.Status, "active"),
            updatedAt: now,
        };
    });

    return {
        exportedAt: now,
        format: "budgeted-ledger-export",
        plaidPolicy: "references-only-disabled-on-import",
        records: {
            ...createEmptyTransferRecords(),
            budgetCategories: categories,
            budgetGroups: groups,
        },
        sourceLedger,
        version: 2,
    };
}

function compareDefinedOrder(
    left: { name: string; sortOrder: number },
    right: { name: string; sortOrder: number },
) {
    return (
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name)
    );
}

function buildWorkbookExportRows(
    records: Pick<
        LedgerExportFile["records"],
        "budgetCategories" | "budgetGroups"
    >,
) {
    const orderedGroups = [...records.budgetGroups].sort(compareDefinedOrder);
    const groups = orderedGroups.map((group) => ({
        "Group ID": group.groupId,
        "Group Name": group.name,
        Status: group.status,
    }));
    const groupPositionById = new Map(
        orderedGroups.map((group, index) => [group.groupId, index]),
    );
    const groupNameById = new Map(
        records.budgetGroups.map((group) => [group.groupId, group.name]),
    );
    const categories = records.budgetCategories
        .filter((category) => !category.systemCategoryKey)
        .sort((left, right) => {
            const leftGroupOrder =
                groupPositionById.get(left.groupId) ?? Number.MAX_SAFE_INTEGER;
            const rightGroupOrder =
                groupPositionById.get(right.groupId) ?? Number.MAX_SAFE_INTEGER;

            return (
                leftGroupOrder - rightGroupOrder ||
                compareDefinedOrder(left, right)
            );
        })
        .map((category) => ({
            "Group ID": `${groupNameById.get(category.groupId) ?? category.groupId} [${category.groupId}]`,
            "Category ID": category.categoryId,
            "Category Name": category.name,
            "Category Type": normalizeBudgetCategoryType(
                typeof category.categoryType === "string"
                    ? category.categoryType
                    : undefined,
            ),
            Schedule: normalizeBudgetCategoryAllocationCadence(
                category.allocationCadence,
            ),
            "Start Month": normalizeBudgetCategoryAllocationStartMonth(
                category.allocationStartMonth,
            ),
            "Default Amount": category.defaultAssignedCents / 100,
            "Income Category": category.isIncomeCategory ? "Yes" : "No",
            "Auto Assign Source": category.autoAssignSourceEnabled ? "Yes" : "No",
            "Auto Assign Sort Order": category.autoAssignSourceSortOrder ?? "",
            Status: category.status,
        }));

    return { categories, groups };
}

export async function createBudgetPlanWorkbookDownload(
    user: CurrentWorkspaceUser,
): Promise<BudgetPlanWorkbookDownload> {
    const exportFile = await buildLedgerExportFile(user);
    const workbook = XLSX.utils.book_new();
    const { categories, groups } = buildWorkbookExportRows(exportFile.records);

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(groups, {
            header: ["Group ID", "Group Name", "Status"],
        }),
        groupSheetName,
    );
    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(categories, {
            header: [
                "Group ID",
                "Category ID",
                "Category Name",
                "Category Type",
                "Schedule",
                "Start Month",
                "Default Amount",
                "Income Category",
                "Auto Assign Source",
                "Auto Assign Sort Order",
                "Status",
            ],
        }),
        categorySheetName,
    );

    return {
        content: XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }),
        contentType: workbookMimeType,
        filename: `budgeted-budget-plan-${slugifyFilenameSegment(
            exportFile.sourceLedger.name,
        )}-${formatExportTimestamp(exportFile.exportedAt)}.xlsx`,
    };
}

export async function importBudgetPlanWorkbook(input: {
    file: File;
    user: CurrentWorkspaceUser;
}) {
    if (input.file.size === 0) {
        throw new HttpError(
            422,
            "budget_plan_workbook_empty",
            "Choose a non-empty budget plan workbook.",
        );
    }

    if (input.file.size > 5 * 1024 * 1024) {
        throw new HttpError(
            422,
            "budget_plan_workbook_too_large",
            "Budget plan workbooks must be 5 MB or smaller.",
        );
    }

    let workbook: XLSX.WorkBook;

    try {
        workbook = XLSX.read(await input.file.arrayBuffer(), { type: "array" });
    } catch {
        throw new HttpError(
            422,
            "budget_plan_workbook_invalid",
            "Choose a valid Excel workbook.",
        );
    }

    const exportFile = buildWorkbookExportFile(workbook, {
        createdAt: new Date().toISOString(),
        ledgerId: input.user.activeLedgerId,
        name: input.user.activeLedgerName,
        updatedAt: new Date().toISOString(),
    });

    return importLedgerExport(input.user, {
        exportFile,
        importScope: "budgetPlan",
        mode: "merge",
    });
}

export const budgetPlanWorkbookTestInternals = {
    buildWorkbookExportFile,
    buildWorkbookExportRows,
    createEmptyTransferRecords,
};
