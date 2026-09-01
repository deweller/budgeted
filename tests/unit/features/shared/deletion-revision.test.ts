import { describe, expect, it } from "vitest";

import {
    countRecordGroups,
    createAllocationRevision,
    createLedgerPostingRevision,
    createPlaidAccountLinkRevision,
    createPlaidItemSyncStateRevision,
    createPlaidTransactionSyncRevision,
    createRecordGroupRevisions,
    createTransactionLineRevision,
    createTransactionRevision,
} from "@/features/shared/server/deletion-revision-service";

describe("deletion revision helpers", () => {
    it("counts and maps grouped records", () => {
        const groups = new Map([
            ["first", [{ id: "one" }, { id: "two" }]],
            ["second", [{ id: "three" }]],
        ]);

        expect(countRecordGroups(groups.values())).toBe(3);
        expect(
            createRecordGroupRevisions(
                groups.values(),
                (record) => `record:${record.id}`,
            ),
        ).toEqual(["record:one", "record:two", "record:three"]);
    });

    it("creates deterministic revision tokens for deletion dependencies", () => {
        expect(
            createAllocationRevision({
                allocationId: "allocation-1",
                updatedAt: "2026-05-01T00:00:00.000Z",
            }),
        ).toBe("allocation:allocation-1:2026-05-01T00:00:00.000Z");
        expect(
            createTransactionRevision({
                transactionId: "transaction-1",
                updatedAt: "2026-05-02T00:00:00.000Z",
            }),
        ).toBe("transaction:transaction-1:2026-05-02T00:00:00.000Z");
        expect(
            createLedgerPostingRevision({
                transactionId: "transaction-1",
                postingId: "posting-1",
                createdAt: "2026-05-03T00:00:00.000Z",
            }),
        ).toBe("posting:transaction-1:posting-1:2026-05-03T00:00:00.000Z");
        expect(
            createTransactionLineRevision({
                transactionId: "transaction-1",
                lineId: "line-1",
                updatedAt: "2026-05-04T00:00:00.000Z",
            }),
        ).toBe("line:transaction-1:line-1:2026-05-04T00:00:00.000Z");
        expect(
            createPlaidAccountLinkRevision({
                plaidAccountLinkId: "link-1",
                updatedAt: "2026-05-05T00:00:00.000Z",
            }),
        ).toBe("plaidLink:link-1:2026-05-05T00:00:00.000Z");
        expect(
            createPlaidTransactionSyncRevision({
                plaidTransactionSyncId: "sync-1",
                updatedAt: "2026-05-06T00:00:00.000Z",
            }),
        ).toBe("plaidSync:sync-1:2026-05-06T00:00:00.000Z");
        expect(
            createPlaidItemSyncStateRevision({
                plaidItemId: "item-1",
                updatedAt: "2026-05-07T00:00:00.000Z",
            }),
        ).toBe("plaidItemSyncState:item-1:2026-05-07T00:00:00.000Z");
    });
});
