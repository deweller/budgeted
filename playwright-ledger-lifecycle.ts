import fs from "node:fs/promises";
import path from "node:path";

import { findUserAccountByEmail } from "./src/lib/auth/user-account";
import {
    createLedger,
    deleteLedger,
} from "./src/features/ledgers/server/ledger-service";

type E2ELedgerState = {
    ledgerId: string;
    ledgerName: string;
    userId: string;
};

const statePath = path.join(process.cwd(), "test-results", "e2e-ledger.json");

async function readState() {
    try {
        return JSON.parse(
            await fs.readFile(statePath, "utf8"),
        ) as E2ELedgerState;
    } catch {
        return null;
    }
}

async function writeState(state: E2ELedgerState) {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(state), "utf8");
}

async function clearState() {
    await fs.rm(statePath, { force: true });
}

function sleep(milliseconds: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

async function waitForActiveLedgerByEmail(input: {
    ledgerId: string;
    userEmail: string;
}) {
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
        const user = await findUserAccountByEmail(input.userEmail);

        if (user?.activeLedgerId === input.ledgerId) {
            return;
        }

        await sleep(250);
    }

    throw new Error(
        `Timed out waiting for e2e user ${input.userEmail} to activate ledger ${input.ledgerId}.`,
    );
}

export async function cleanupE2ELedger() {
    const state = await readState();

    if (!state) {
        return;
    }

    try {
        await deleteLedger(state.userId, state.ledgerId, {
            confirmationName: state.ledgerName,
        });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ledger_missing"
        ) {
            return;
        }

        throw error;
    } finally {
        await clearState();
    }
}

export async function createE2ELedger(userEmail: string | undefined) {
    if (!userEmail) {
        return;
    }

    await cleanupE2ELedger();

    const user = await findUserAccountByEmail(userEmail);

    if (!user) {
        return;
    }

    const ledgerName = `E2E ledger ${Date.now()} ${process.pid}`;
    const ledger = await createLedger(user.userId, { name: ledgerName });

    await waitForActiveLedgerByEmail({
        ledgerId: ledger.ledgerId,
        userEmail,
    });

    await writeState({
        ledgerId: ledger.ledgerId,
        ledgerName,
        userId: user.userId,
    });
}
