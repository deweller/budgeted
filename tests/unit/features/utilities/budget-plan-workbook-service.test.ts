import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { budgetPlanWorkbookTestInternals } from "@/features/utilities/server/budget-plan-workbook-service";

const sourceLedger = {
    createdAt: "2026-01-01T00:00:00.000Z",
    ledgerId: "ledger-1",
    name: "Household",
    updatedAt: "2026-06-01T00:00:00.000Z",
};

function createWorkbook() {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet([
            {
                "Group ID": "essentials",
                "Group Name": "Essentials",
                Status: "Active",
            },
        ]),
        "Budget Groups",
    );
    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet([
            {
                "Auto Assign Source": "Yes",
                "Auto Assign Sort Order": 2,
                "Category ID": "groceries",
                "Category Name": "Groceries",
                "Category Type": "Savings",
                "Default Amount": 125.5,
                "Group ID": "Essentials [essentials]",
                "Income Category": "No",
                Schedule: "Yearly",
                "Start Month": 6,
                Status: "Active",
            },
        ]),
        "Budget Categories",
    );

    return workbook;
}

describe("budget plan workbook service", () => {
    it("turns a Budgeted workbook into a budget plan-only ledger import", () => {
        const exportFile = budgetPlanWorkbookTestInternals.buildWorkbookExportFile(
            createWorkbook(),
            sourceLedger,
        );

        expect(exportFile.records.budgetGroups).toMatchObject([
            {
                groupId: "essentials",
                name: "Essentials",
                status: "active",
            },
        ]);
        expect(exportFile.records.budgetCategories).toMatchObject([
            {
                allocationCadence: "yearly",
                allocationStartMonth: 6,
                autoAssignSourceEnabled: true,
                autoAssignSourceSortOrder: 2,
                categoryId: "groceries",
                categoryType: "savings",
                defaultAssignedCents: 12_550,
                groupId: "essentials",
                ledgerAccountId: "cat_groceries",
            },
        ]);
        expect(exportFile.records.transactions).toEqual([]);
    });

    it("orders workbook rows by defined group and category order", () => {
        const rows = budgetPlanWorkbookTestInternals.buildWorkbookExportRows({
            budgetCategories: [
                {
                    categoryId: "later-essentials",
                    defaultAssignedCents: 0,
                    groupId: "essentials",
                    name: "Later essentials",
                    sortOrder: 2,
                    status: "active",
                },
                {
                    categoryId: "first-lifestyle",
                    defaultAssignedCents: 0,
                    groupId: "lifestyle",
                    name: "First lifestyle",
                    sortOrder: 0,
                    status: "active",
                },
                {
                    categoryId: "first-essentials",
                    defaultAssignedCents: 0,
                    groupId: "essentials",
                    name: "First essentials",
                    sortOrder: 0,
                    status: "active",
                },
            ],
            budgetGroups: [
                {
                    groupId: "lifestyle",
                    name: "Lifestyle",
                    sortOrder: 1,
                    status: "active",
                },
                {
                    groupId: "essentials",
                    name: "Essentials",
                    sortOrder: 0,
                    status: "active",
                },
            ],
        } as never);

        expect(rows.groups.map((group) => group["Group ID"])).toEqual([
            "essentials",
            "lifestyle",
        ]);
        expect(Object.keys(rows.categories[0]!)).toEqual([
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
        ]);
        expect(
            rows.categories.map((category) => ({
                categoryId: category["Category ID"],
                group: category["Group ID"],
            })),
        ).toEqual([
            {
                categoryId: "first-essentials",
                group: "Essentials [essentials]",
            },
            {
                categoryId: "later-essentials",
                group: "Essentials [essentials]",
            },
            {
                categoryId: "first-lifestyle",
                group: "Lifestyle [lifestyle]",
            },
        ]);
    });

    it("rejects a category whose group is absent from the workbook", () => {
        const workbook = createWorkbook();
        const categories = workbook.Sheets["Budget Categories"]!;

        categories.G2 = { t: "s", v: "missing-group" };

        expect(() =>
            budgetPlanWorkbookTestInternals.buildWorkbookExportFile(
                workbook,
                sourceLedger,
            ),
        ).toThrow(/references a group/i);
    });
});
