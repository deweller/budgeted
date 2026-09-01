import type { WorkspaceReadiness } from "@/lib/workspace/readiness";

import { WorkspaceStatusPanel } from "@/components/dashboard/workspace-status-panel";

type EmptyStatePanelProps = {
    readiness: WorkspaceReadiness;
    title: string;
};

export function EmptyStatePanel({ readiness, title }: EmptyStatePanelProps) {
    return (
        <WorkspaceStatusPanel
            actionHref={readiness.primaryActionHref}
            actionLabel={readiness.primaryActionLabel}
            message={readiness.message}
            title={title}
            tone={readiness.status === "partial" ? "info" : "warning"}
        />
    );
}
