import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    getActiveLedgerContext: vi.fn(),
    userAccountsByEmail: vi.fn(),
}));

vi.mock("@/auth", () => ({
    auth: mocks.auth,
}));

vi.mock("@/features/ledgers/server/ledger-service", () => ({
    getActiveLedgerContext: mocks.getActiveLedgerContext,
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            userAccounts: {
                query: {
                    byEmail: mocks.userAccountsByEmail,
                },
            },
        },
    }),
}));

import {
    requireCurrentSuperUserAccount,
    requireCurrentUserAccount,
} from "@/lib/auth/current-user";

type TestUserAccount = {
    activeLedgerId?: string;
    createdAt: string;
    displayName: string;
    email: string;
    passwordHash: string;
    role: "normal" | "super";
    updatedAt: string;
    userId: string;
    workspaceId: string;
};

function createAccount(input: {
    activeLedgerId?: string;
    email: string;
    role?: "normal" | "super";
    userId: string;
}): TestUserAccount {
    return {
        userId: input.userId,
        workspaceId: "global",
        email: input.email,
        passwordHash: "hash",
        displayName: input.email,
        role: input.role ?? "normal",
        activeLedgerId: input.activeLedgerId,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

describe("current user workspace resolution", () => {
    let accounts: Map<string, TestUserAccount>;

    beforeEach(() => {
        vi.clearAllMocks();
        accounts = new Map();

        mocks.userAccountsByEmail.mockImplementation(
            ({ email }: { email: string }) => ({
                go: async () => ({
                    data: accounts.has(email) ? [accounts.get(email)] : [],
                }),
            }),
        );
        mocks.getActiveLedgerContext.mockResolvedValue({
            ledger: {
                ledgerId: "ledger-1",
                name: "Shared Ledger",
                workspaceId: "global",
            },
            ledgerId: "ledger-1",
            ledgerName: "Shared Ledger",
        });
    });

    it("resolves the signed-in user into the shared active ledger", async () => {
        const member = createAccount({
            activeLedgerId: "ledger-1",
            email: "member@example.com",
            userId: "member-1",
        });

        accounts.set(member.email, member);
        mocks.auth.mockResolvedValue({
            user: {
                email: "member@example.com",
            },
        });

        const currentUser = await requireCurrentUserAccount();

        expect(mocks.getActiveLedgerContext).toHaveBeenCalledWith(member);
        expect(currentUser).toMatchObject({
            userId: "member-1",
            email: "member@example.com",
            activeLedgerId: "ledger-1",
            activeLedgerName: "Shared Ledger",
        });
    });

    it("uses the signed-in account for active ledger resolution", async () => {
        const account = createAccount({
            activeLedgerId: "ledger-1",
            email: "owner@example.com",
            role: "super",
            userId: "owner-1",
        });

        accounts.set(account.email, account);
        mocks.auth.mockResolvedValue({
            user: {
                email: "owner@example.com",
            },
        });

        await requireCurrentUserAccount();

        expect(mocks.getActiveLedgerContext).toHaveBeenCalledWith(account);
    });

    it("allows super users to manage user accounts", async () => {
        const account = createAccount({
            activeLedgerId: "ledger-1",
            email: "owner@example.com",
            role: "super",
            userId: "owner-1",
        });

        accounts.set(account.email, account);
        mocks.auth.mockResolvedValue({
            user: {
                email: "owner@example.com",
            },
        });

        await expect(requireCurrentSuperUserAccount()).resolves.toMatchObject({
            role: "super",
            userId: "owner-1",
        });
    });

    it("rejects normal users from user account management", async () => {
        const member = createAccount({
            email: "member@example.com",
            userId: "member-1",
        });

        accounts.set(member.email, member);
        mocks.auth.mockResolvedValue({
            user: {
                email: "member@example.com",
            },
        });

        await expect(requireCurrentSuperUserAccount()).rejects.toMatchObject({
            code: "forbidden",
            status: 403,
        });
    });
});
