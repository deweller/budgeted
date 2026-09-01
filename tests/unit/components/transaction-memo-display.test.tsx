import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    getTransactionManagedReferenceFields,
    TransactionManagedMetadataReadonly,
    TransactionMemoDisplay,
} from "@/components/transactions/transaction-memo-display";
import type { TransactionImportActivityRecord } from "@/features/transaction-importers/models/transaction-importer-contract";

const amazonActivity = {
    activityId: "amazon:payment-1",
    createdAt: "2026-08-08T12:00:00.000Z",
    detailsJson: JSON.stringify({
        itemSummary: "USB cable",
        orderNumber: "111-222",
        paymentKind: "charge",
    }),
    detailsVersion: 2,
    direction: "outflow",
    financialFingerprint: "amazon-fingerprint",
    ledgerId: "ledger-1",
    linkedTransactionId: "transaction-1",
    occurredDate: "2026-08-08",
    provider: "amazon",
    providerAmountCents: -2_500,
    providerRecordId: "payment-1",
    state: "autoMatched",
    updatedAt: "2026-08-08T12:00:00.000Z",
} satisfies TransactionImportActivityRecord;

const venmoActivity = {
    activityId: "venmo:provider-1",
    counterparty: "Sample Friend",
    createdAt: "2026-08-08T12:00:00.000Z",
    detailsJson: JSON.stringify({
        activityId: "paymentSent:provider-1",
        activityKind: "paymentSent",
        sourceMessageId: "message-1",
        sourceSubject: "You paid Sample Friend",
    }),
    detailsVersion: 2,
    direction: "outflow",
    financialFingerprint: "venmo-fingerprint",
    ledgerId: "ledger-1",
    linkedTransactionId: "transaction-1",
    memo: "Dinner",
    occurredDate: "2026-08-08",
    provider: "venmo",
    providerAmountCents: 1_200,
    providerRecordId: "provider-1",
    state: "posted",
    updatedAt: "2026-08-08T12:00:00.000Z",
} satisfies TransactionImportActivityRecord;

describe("TransactionMemoDisplay", () => {
    it("renders the editable memo before canonical importer information", () => {
        const { container } = render(
            <TransactionMemoDisplay
                managedMetadata={{ importActivities: [amazonActivity] }}
                memo="User memo"
            />,
        );

        expect(screen.getByText("User memo")).toHaveClass("truncate");
        expect(screen.getByText("USB cable")).toHaveClass("truncate");
        expect(screen.getByText("111-222")).toHaveClass(
            "font-mono",
        );
        expect(screen.getByText("111-222").parentElement).toHaveClass(
            "shrink-[999]",
            "truncate",
        );
        expect(screen.queryByText("Transaction ID:")).not.toBeInTheDocument();
        expect(container.querySelector("[data-memo-managed-separator]")).toHaveClass(
            "border-l",
            "w-px",
            "self-stretch",
        );
        expect(screen.getByText("User memo").parentElement).toHaveClass(
            "flex",
            "w-full",
            "overflow-hidden",
        );
    });

    it("labels importer transaction IDs in expanded memo displays", () => {
        render(
            <TransactionMemoDisplay
                managedMetadata={{ importActivities: [amazonActivity] }}
                showFullMemo
            />,
        );

        expect(screen.getByText("Transaction ID:")).toBeVisible();
        expect(screen.getByText("111-222")).toHaveClass("font-mono");
    });

    it("keeps managed-only compact displays at the memo line height", () => {
        render(
            <TransactionMemoDisplay
                managedMetadata={{ importActivities: [amazonActivity] }}
            />,
        );

        expect(
            screen.getByText("USB cable").parentElement?.parentElement,
        ).toHaveClass("leading-5");
    });

    it("renders every registered importer and exposes adapter reference fields", () => {
        render(
            <TransactionManagedMetadataReadonly
                transaction={{ importActivities: [amazonActivity, venmoActivity] }}
            />,
        );

        expect(screen.getByText("Managed transaction information")).toBeVisible();
        expect(screen.getByText("USB cable")).toBeVisible();
        expect(screen.getByText("Paid Sample Friend with memo Dinner.")).toBeVisible();
        expect(screen.getByText("provider-1")).toHaveClass(
            "font-mono",
        );
        expect(
            getTransactionManagedReferenceFields({
                importActivities: [venmoActivity],
            }),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    key: "providerAmountCents",
                    value: 1_200,
                }),
                expect.objectContaining({ key: "memo", value: "Dinner" }),
                expect.objectContaining({
                    key: "sourceMessageId",
                    value: "message-1",
                }),
            ]),
        );
    });

    it("can label transaction IDs in managed information panes", () => {
        render(
            <TransactionManagedMetadataReadonly
                showSummaryIdentifierLabel
                transaction={{ importActivities: [amazonActivity] }}
            />,
        );

        expect(screen.getByText("Transaction ID:")).toBeVisible();
    });
});
