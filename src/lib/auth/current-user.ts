import { auth } from "@/auth";
import { HttpError } from "@/lib/api/errors";
import {
    findUserAccountById,
    findUserAccountByEmail,
    getUserAccountRole,
} from "@/lib/auth/user-account";
import { getActiveLedgerContext } from "@/features/ledgers/server/ledger-service";

type CurrentUserWithLedger = Awaited<
    ReturnType<typeof requireCurrentUserAccount>
>;

export async function requireCurrentUserAccount() {
    const session = await auth();
    const email = session?.user?.email;
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id;

    if (!email) {
        throw new HttpError(401, "not_authenticated", "You must be signed in.");
    }

    const account = sessionUserId
        ? await findUserAccountById(sessionUserId)
        : await findUserAccountByEmail(email);

    if (!account) {
        throw new HttpError(
            401,
            "user_missing",
            "The user account could not be found.",
        );
    }

    const activeLedger = await getActiveLedgerContext(account);

    return {
        ...account,
        role: getUserAccountRole(account),
        activeLedger,
        activeLedgerId: activeLedger.ledgerId,
        activeLedgerName: activeLedger.ledgerName,
    };
}

export async function requireCurrentSuperUserAccount() {
    const user = await requireCurrentUserAccount();

    if (user.role !== "super") {
        throw new HttpError(
            403,
            "forbidden",
            "Only super users can manage user accounts.",
        );
    }

    return user;
}

export function getActiveLedgerId(
    user: Pick<CurrentUserWithLedger, "activeLedgerId">,
) {
    return user.activeLedgerId;
}
