import { userAccountPasswordSchema } from "@/features/users/models/user-account-form";
import { resetUserAccountPassword } from "@/features/users/server/user-account-service";
import { superUserJson } from "@/lib/api/user-route";
import { parseJsonBody } from "@/lib/api/validation";

type UserPasswordRouteContext = {
    params: Promise<{ userId: string }>;
};

export async function PUT(
    request: Request,
    context: UserPasswordRouteContext,
) {
    return superUserJson(async () => {
        const { userId } = await context.params;
        const passwordInput = await parseJsonBody(
            request,
            userAccountPasswordSchema,
        );

        return resetUserAccountPassword({
            passwordInput,
            userId,
        });
    });
}
