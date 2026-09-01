import { userAccountCreateSchema } from "@/features/users/models/user-account-form";
import {
    createUserAccount,
    listUserAccounts,
} from "@/features/users/server/user-account-service";
import { superUserJson } from "@/lib/api/user-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function GET() {
    return superUserJson(async () => ({ users: await listUserAccounts() }));
}

export async function POST(request: Request) {
    return superUserJson(
        async () => {
            const input = await parseJsonBody(request, userAccountCreateSchema);
            return createUserAccount(input);
        },
        { status: 201 },
    );
}
