import { ulid } from "ulid";

export function createWorkspaceMutationId() {
    return globalThis.crypto?.randomUUID?.() ?? ulid();
}
