import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { findUserAccountByEmail } from "@/lib/auth/user-account";
import { getServerEnv } from "@/lib/env/server";
import { verifyPassword } from "@/lib/auth/password";

const credentialsSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});

const isProduction = process.env.NODE_ENV === "production";
const { authSecret } = getServerEnv();

export const { handlers, auth, signIn, signOut } = NextAuth({
    secret: authSecret,
    trustHost: true,
    useSecureCookies: isProduction,
    session: {
        strategy: "jwt",
        maxAge: 60 * 60 * 24 * 30,
        updateAge: 60 * 60 * 12,
    },
    pages: {
        signIn: "/sign-in",
    },
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            authorize: async (credentials) => {
                const parsed = credentialsSchema.safeParse(credentials);

                if (!parsed.success) {
                    return null;
                }

                const account = await findUserAccountByEmail(parsed.data.email);

                if (!account) {
                    return null;
                }

                const isValid = await verifyPassword(
                    parsed.data.password,
                    account.passwordHash,
                );

                if (!isValid) {
                    return null;
                }

                return {
                    id: account.userId,
                    email: account.email,
                    name: account.displayName,
                };
            },
        }),
    ],
    callbacks: {
        session({ session, token }) {
            if (session.user && token.sub) {
                (session.user as typeof session.user & { id: string }).id =
                    token.sub;
            }

            return session;
        },
    },
});
