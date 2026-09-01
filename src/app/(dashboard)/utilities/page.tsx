import { UtilitiesWorkspace } from "@/components/workspace/workspace-views";
import { requireCurrentUserAccount } from "@/lib/auth/current-user";

export default async function UtilitiesPage() {
    const user = await requireCurrentUserAccount();

    return <UtilitiesWorkspace canManageUsers={user.role === "super"} />;
}
