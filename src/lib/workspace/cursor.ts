import type { WorkspaceCursor } from "@/lib/workspace/sync-types";

const CURSOR_PATTERN = /^g(\d+):r(\d+)$/;
const REVISION_KEY_LENGTH = 16;

function assertWorkspaceCursor(cursor: WorkspaceCursor) {
    if (
        !Number.isSafeInteger(cursor.generation) ||
        cursor.generation < 1 ||
        !Number.isSafeInteger(cursor.revision) ||
        cursor.revision < 0
    ) {
        throw new Error("Workspace cursors require non-negative safe integers.");
    }
}

export function encodeWorkspaceCursor(cursor: WorkspaceCursor) {
    assertWorkspaceCursor(cursor);

    return `g${cursor.generation}:r${cursor.revision}`;
}

export function parseWorkspaceCursor(value: string | null | undefined) {
    if (!value) {
        return null;
    }

    const match = CURSOR_PATTERN.exec(value);

    if (!match) {
        return null;
    }

    const cursor = {
        generation: Number(match[1]),
        revision: Number(match[2]),
    };

    try {
        assertWorkspaceCursor(cursor);
        return cursor;
    } catch {
        return null;
    }
}

export function toWorkspaceRevisionKey(revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error("Workspace revisions require non-negative safe integers.");
    }

    return String(revision).padStart(REVISION_KEY_LENGTH, "0");
}
