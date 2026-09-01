import { describe, expect, it } from "vitest";

import { normalizeTransactionIds } from "@/features/transactions/models/transaction-ids";

describe("transaction ids", () => {
    it("trims, removes blanks, and preserves first unique ids", () => {
        expect(
            normalizeTransactionIds([
                " transaction-1 ",
                "",
                "transaction-2",
                "transaction-1",
                "   ",
                "transaction-3",
            ]),
        ).toEqual(["transaction-1", "transaction-2", "transaction-3"]);
    });
});
