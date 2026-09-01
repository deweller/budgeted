import type { WorkspaceSection } from "@/lib/navigation/workspace-sections";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { WorkspaceNavLinks } from "@/components/dashboard/workspace-nav-links";

type MobileNavProps = {
    sections: WorkspaceSection[];
};

export function MobileNav({ sections }: MobileNavProps) {
    return (
        <section className="border-b border-[var(--color-border)] bg-[var(--color-panel)] p-4 lg:hidden">
            <p className={typographyClassNames.eyebrow}>Budgeted</p>
            <WorkspaceNavLinks
                ariaLabel="Primary mobile"
                layout="inline"
                sections={sections}
            />
            <SignOutButton
                className={`mt-4 ${controlClassNames.secondaryActionCompact}`}
            />
        </section>
    );
}
