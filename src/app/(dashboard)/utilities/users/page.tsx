import { UtilityUsersWorkspace } from "@/components/workspace/workspace-views";
import { requireCurrentUserAccount } from "@/lib/auth/current-user";

export default async function UtilityUsersPage() {
    const user = await requireCurrentUserAccount();

    return <UtilityUsersWorkspace canManageUsers={user.role === "super"} />;
}
