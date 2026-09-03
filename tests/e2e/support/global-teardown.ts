import { cleanupE2ELedger } from "./ledger-lifecycle";

export default async function globalTeardown() {
    await cleanupE2ELedger();
}
