import { cleanupE2ELedger } from "./playwright-ledger-lifecycle";

export default async function globalTeardown() {
    await cleanupE2ELedger();
}
