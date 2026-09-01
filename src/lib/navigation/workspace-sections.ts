export type WorkspaceSection = {
    href:
        | "/accounts"
        | "/budget"
        | "/dashboard"
        | "/global-budget"
        | "/ledgers"
        | "/reporting"
        | "/transactions"
        | "/utilities";
    label:
        | "Accounts"
        | "Home"
        | "Budget Plan"
        | "Ledgers"
        | "Monthly Budget"
        | "Reporting"
        | "Transactions"
        | "Utilities";
    sectionId:
        | "accounts"
        | "budget"
        | "dashboard"
        | "globalBudget"
        | "ledgers"
        | "reporting"
        | "transactions"
        | "utilities";
};

export const WORKSPACE_SECTIONS: WorkspaceSection[] = [
    {
        href: "/dashboard",
        label: "Home",
        sectionId: "dashboard",
    },
    {
        href: "/budget",
        label: "Monthly Budget",
        sectionId: "budget",
    },
    {
        href: "/transactions",
        label: "Transactions",
        sectionId: "transactions",
    },
    {
        href: "/accounts",
        label: "Accounts",
        sectionId: "accounts",
    },
    {
        href: "/reporting",
        label: "Reporting",
        sectionId: "reporting",
    },
    {
        href: "/global-budget",
        label: "Budget Plan",
        sectionId: "globalBudget",
    },
    {
        href: "/utilities",
        label: "Utilities",
        sectionId: "utilities",
    },
];
