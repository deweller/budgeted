export type WorkspaceStatusTone = "error" | "info" | "success" | "warning";

export const surfaceClassNames = {
    panel: "border border-[var(--color-border)] bg-[var(--color-panel)] shadow-[var(--shadow-panel)]",
    panelStrong:
        "border border-[var(--color-border)] bg-[var(--color-panel-strong)] shadow-[var(--shadow-panel)]",
    accentPanel:
        "border border-[var(--color-border)] bg-[var(--color-accent-soft)] shadow-[var(--shadow-panel)]",
} as const;

export const typographyClassNames = {
    eyebrow:
        "font-[family:var(--font-mono)] text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]",
    eyebrowWide:
        "font-[family:var(--font-mono)] text-sm uppercase tracking-[0.24em] text-[var(--color-muted)]",
    mutedBody: "text-[var(--color-muted)]",
    accentEyebrow:
        "font-[family:var(--font-mono)] text-sm uppercase tracking-[0.2em] text-[var(--color-accent-contrast)]",
} as const;

export const controlClassNames = {
    field: "border border-[var(--color-field-border)] bg-[var(--color-field)] px-4 py-3 text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent-ink)] focus:ring-2 focus:ring-[var(--color-accent-ring)] disabled:cursor-not-allowed disabled:opacity-60",
    fieldCompact:
        "border border-[var(--color-field-border)] bg-[var(--color-field)] px-3 py-2 text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent-ink)] focus:ring-2 focus:ring-[var(--color-accent-ring)] disabled:cursor-not-allowed disabled:opacity-60",
    primaryAction:
        "border border-[var(--color-accent-ink)] bg-[var(--color-accent-ink)] px-4 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-ink-strong)] disabled:cursor-not-allowed disabled:opacity-60",
    primaryActionCompact:
        "cursor-pointer border border-[var(--color-accent-ink)] bg-[var(--color-accent-ink)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent-ink-strong)] disabled:cursor-not-allowed disabled:opacity-60",
    secondaryAction:
        "border border-[var(--color-border)] bg-[var(--color-panel-strong)] px-4 py-3 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)] disabled:cursor-not-allowed disabled:opacity-60",
    secondaryActionCompact:
        "border border-[var(--color-border)] bg-[var(--color-panel-strong)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)] disabled:cursor-not-allowed disabled:opacity-60",
    secondarySolidActionCompact:
        "cursor-pointer border border-[var(--color-secondary-action-border)] bg-[var(--color-secondary-action)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-secondary-action-hover)] disabled:cursor-not-allowed disabled:opacity-60",
    secondaryActionSmall:
        "border border-[var(--color-border)] bg-[var(--color-panel-strong)] px-3 py-2 text-xs font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)] disabled:cursor-not-allowed disabled:opacity-60",
    outlineLinkCompact:
        "cursor-pointer border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)]",
} as const;

export const tableClassNames = {
    stickyHeader:
        "sticky top-0 z-20 bg-[var(--color-panel)] shadow-[0_1px_0_var(--color-border)] [&>tr>th]:sticky [&>tr>th]:top-0 [&>tr>th]:z-20 [&>tr>th]:bg-[var(--color-panel)] [&>tr>th]:shadow-[0_1px_0_var(--color-border)]",
} as const;

const navigationLinkBaseClassNames = {
    inline: "shrink-0 border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]",
    stacked:
        "flex items-center gap-3 border px-4 py-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]",
    stackedCompact:
        "flex h-11 items-center justify-center border text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]",
} as const;

const navigationLinkStateClassNames = {
    active: "border-[var(--color-accent-ink)] bg-[var(--color-accent-soft)] text-[var(--color-ink)]",
    idle: "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)]",
} as const;

export function getWorkspaceNavLinkClassName(
    layout: "inline" | "stacked" | "stackedCompact",
    isActive: boolean,
) {
    return `${navigationLinkBaseClassNames[layout]} ${
        isActive
            ? navigationLinkStateClassNames.active
            : navigationLinkStateClassNames.idle
    }`;
}

export const workspaceStatusToneStyles: Record<
    WorkspaceStatusTone,
    {
        body: string;
        button: string;
        eyebrow: string;
        label: string;
    }
> = {
    error: {
        body: "border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] text-[var(--tone-error-ink)]",
        button: "border-[var(--tone-error-border)] text-[var(--tone-error-ink)] hover:bg-[var(--tone-error-surface-strong)]",
        eyebrow: "text-[var(--tone-error-ink)]",
        label: "Read status",
    },
    info: {
        body: "border-[var(--tone-info-border)] bg-[var(--tone-info-surface)] text-[var(--tone-info-ink)]",
        button: "border-[var(--tone-info-border)] text-[var(--tone-info-ink)] hover:bg-[var(--tone-info-surface-strong)]",
        eyebrow: "text-[var(--tone-info-ink)]",
        label: "Workspace status",
    },
    success: {
        body: "border-[var(--tone-success-border)] bg-[var(--tone-success-surface)] text-[var(--tone-success-ink)]",
        button: "border-[var(--tone-success-border)] text-[var(--tone-success-ink)] hover:bg-[var(--tone-success-surface-strong)]",
        eyebrow: "text-[var(--tone-success-ink)]",
        label: "Saved state",
    },
    warning: {
        body: "border-[var(--tone-warning-border)] bg-[var(--tone-warning-surface)] text-[var(--tone-warning-ink)]",
        button: "border-[var(--tone-warning-border)] text-[var(--tone-warning-ink)] hover:bg-[var(--tone-warning-surface-strong)]",
        eyebrow: "text-[var(--tone-warning-ink)]",
        label: "Next step",
    },
};

export function getWorkspaceStatusToneStyles(tone: WorkspaceStatusTone) {
    return workspaceStatusToneStyles[tone];
}

export function getMoneyToneClassName(cents: number) {
    if (cents > 0) {
        return "money-positive";
    }

    if (cents < 0) {
        return "money-negative";
    }

    return "money-zero";
}
