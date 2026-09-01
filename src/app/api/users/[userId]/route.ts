import { userAccountUpdateSchema } from "@/features/users/models/user-account-form";
import {
    deleteUserAccount,
    updateUserAccount,
} from "@/features/users/server/user-account-service";
import { superUserJson } from "@/lib/api/user-route";
import { parseJsonBody } from "@/lib/api/validation";
import { normalizeEmail } from "@/lib/auth/user-account";

type UserRouteContext = {
    params: Promise<{ userId: string }>;
};

export async function PATCH(request: Request, context: UserRouteContext) {
    return superUserJson(async ({ currentUser }) => {
        const { userId } = await context.params;
        const updates = await parseJsonBody(request, userAccountUpdateSchema);
        const requiresSignOut =
            currentUser.userId === userId &&
            normalizeEmail(updates.email) !== normalizeEmail(currentUser.email);

        return {
            ...(await updateUserAccount({
                actorUserId: currentUser.userId,
                updates,
                userId,
            })),
            requiresSignOut,
        };
    });
}

export async function DELETE(_request: Request, context: UserRouteContext) {
    return superUserJson(async ({ currentUser }) => {
        const { userId } = await context.params;

        return deleteUserAccount({
            actorUserId: currentUser.userId,
            userId,
        });
    });
}
