"use client";

import { faWallet } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";

import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

export default function SignInPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);

        const form = new FormData(event.currentTarget);
        const email = String(form.get("email") ?? "");
        const password = String(form.get("password") ?? "");

        startTransition(async () => {
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
                callbackUrl: "/",
            });

            if (result?.error) {
                setError("Invalid email or password.");
                return;
            }

            router.replace("/");
        });
    }

    return (
        <main className="flex min-h-screen items-center px-6 py-16">
            <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr]">
                <section
                    className={`flex min-h-[460px] flex-col justify-center p-8 sm:p-10 ${surfaceClassNames.panel}`}
                >
                    <div className="grid max-w-xl gap-7">
                        <FontAwesomeIcon
                            aria-hidden="true"
                            icon={faWallet}
                            className="text-[6.5rem] leading-none text-[var(--color-accent-ink)] sm:text-[7.5rem]"
                        />
                        <div>
                            <p className={typographyClassNames.eyebrowWide}>
                                Budgeted
                            </p>
                            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                                Welcome back.
                            </h1>
                        </div>
                    </div>
                </section>

                <section className={`p-8 sm:p-10 ${surfaceClassNames.panel}`}>
                    <div className="mb-6">
                        <p className={typographyClassNames.eyebrow}>Sign in</p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                            Please log in to continue
                        </h2>
                    </div>
                    <form className="grid gap-5" onSubmit={handleSubmit}>
                        <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                            Email
                            <input
                                required
                                name="email"
                                type="email"
                                autoComplete="email"
                                className={controlClassNames.field}
                            />
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                            Password
                            <input
                                required
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                className={controlClassNames.field}
                            />
                        </label>

                        {error ? (
                            <p className="border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] px-4 py-3 text-sm text-[var(--tone-error-ink)]">
                                {error}
                            </p>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isPending}
                            className={controlClassNames.primaryAction}
                        >
                            {isPending ? "Signing in..." : "Sign in"}
                        </button>
                    </form>
                </section>
            </div>
        </main>
    );
}
