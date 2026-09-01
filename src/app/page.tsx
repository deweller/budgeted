import { faWallet } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { findUserAccountByEmail } from "@/lib/auth/user-account";
import { resolveWorkspaceLanding } from "@/lib/auth/workspace-landing";
import { controlClassNames } from "@/lib/theme/theme-recipes";

export default async function Home() {
    const session = await auth();

    if (session?.user?.email) {
        const signedInAccount = await findUserAccountByEmail(
            session.user.email,
        );

        if (signedInAccount) {
            redirect(await resolveWorkspaceLanding(signedInAccount.userId));
        }

        redirect("/sign-in");
    }

    if (session?.user) {
        redirect("/sign-in");
    }

    return (
        <main className="flex min-h-screen items-center justify-center px-6 py-16">
            <section className="grid max-w-xl justify-items-center gap-7 text-center">
                <FontAwesomeIcon
                    aria-hidden="true"
                    icon={faWallet}
                    className="text-[6.5rem] leading-none text-[var(--color-accent-ink)] sm:text-[7.5rem]"
                />
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    Budgeted
                </h1>
                <Link href="/budget" className={controlClassNames.primaryAction}>
                    Open budget
                </Link>
            </section>
        </main>
    );
}
