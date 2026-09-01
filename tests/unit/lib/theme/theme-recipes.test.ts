import { describe, expect, it } from "vitest";

import {
    appViewport,
    documentBodyClassName,
    documentRootClassName,
} from "@/lib/theme/document-theme";
import {
    controlClassNames,
    getMoneyToneClassName,
    getWorkspaceNavLinkClassName,
    getWorkspaceStatusToneStyles,
    surfaceClassNames,
} from "@/lib/theme/theme-recipes";

describe("theme recipes", () => {
    it("defines a dark-only document viewport", () => {
        expect(appViewport.colorScheme).toBe("dark");
        expect(appViewport.themeColor).toBe("#07101b");
        expect(documentRootClassName).toContain("dark");
        expect(documentBodyClassName).toContain("bg-[var(--color-surface)]");
    });

    it("exposes reusable dark surface and control recipes", () => {
        expect(surfaceClassNames.panel).toContain("bg-[var(--color-panel)]");
        expect(controlClassNames.field).toContain("bg-[var(--color-field)]");
        expect(controlClassNames.primaryAction).toContain(
            "bg-[var(--color-accent-ink)]",
        );
    });

    it("returns dark navigation and status tone recipes", () => {
        expect(getWorkspaceNavLinkClassName("stacked", true)).toContain(
            "bg-[var(--color-accent-soft)]",
        );
        expect(getWorkspaceNavLinkClassName("inline", false)).toContain(
            "bg-[var(--color-panel)]",
        );

        const errorTone = getWorkspaceStatusToneStyles("error");
        expect(errorTone.body).toContain("bg-[var(--tone-error-surface)]");
        expect(errorTone.button).toContain(
            "hover:bg-[var(--tone-error-surface-strong)]",
        );
    });

    it("returns money tone classes by sign", () => {
        expect(getMoneyToneClassName(1)).toBe("money-positive");
        expect(getMoneyToneClassName(-1)).toBe("money-negative");
        expect(getMoneyToneClassName(0)).toBe("money-zero");
    });
});
