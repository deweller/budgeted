import { describe, expect, it } from "vitest";

import { parseAmazonOrdersPayload } from "@/features/amazon/models/amazon-order-parser";

describe("Amazon order parser", () => {
    it("normalizes orders, charges, refunds, cents, and item summaries", () => {
        const result = parseAmazonOrdersPayload({
            orders: [
                {
                    order_number: "111-222",
                    order_placed_date: "2026-06-20",
                    grand_total: "-15.45",
                    items: [
                        { title: "USB cable" },
                        { title: "Notebook" },
                        { title: "Coffee filters" },
                    ],
                    transactions: [
                        {
                            completed_date: "2026-06-21",
                            grand_total: -15.45,
                            is_refund: false,
                            order_number: "111-222",
                            payment_method: "Prime Visa ****1234",
                            payment_method_last_4: "1234",
                            seller: "Amazon",
                        },
                        {
                            completed_date: "2026-06-22",
                            grand_total: 5.12,
                            is_refund: true,
                            order_number: "111-222",
                            payment_method: "Prime Visa ****1234",
                            payment_method_last_4: "1234",
                            seller: "Amazon",
                        },
                    ],
                },
            ],
        });

        expect(result.orders).toEqual([
            expect.objectContaining({
                amazonOrderId: "111-222",
                grandTotalCents: -1545,
                itemSummary: "USB cable; Notebook; +1 more",
                itemTitles: ["USB cable", "Notebook", "Coffee filters"],
                orderNumber: "111-222",
                orderPlacedDate: "2026-06-20",
            }),
        ]);
        expect(result.payments).toEqual([
            expect.objectContaining({
                amountCents: -1545,
                completedDate: "2026-06-21",
                isRefund: false,
                orderNumber: "111-222",
                paymentMethodLast4: "1234",
            }),
            expect.objectContaining({
                amountCents: 512,
                completedDate: "2026-06-22",
                isRefund: true,
                orderNumber: "111-222",
            }),
        ]);
        expect(result.payments[0]?.amazonPaymentId).toMatch(/^amazon-payment-/);
    });
});
