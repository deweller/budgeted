export const WORKSPACE_RECONCILIATION_REQUIRED_EVENT =
    "budgeted:workspace-reconciliation-required";

export class WorkspaceMutationResponseError extends Error {
    constructor() {
        super(
            "The server response could not be reconciled. The latest saved data is being restored.",
        );
        this.name = "WorkspaceMutationResponseError";
    }
}

export function requestWorkspaceReconciliation() {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(
        new Event(WORKSPACE_RECONCILIATION_REQUIRED_EVENT),
    );
}
