export const VENMO_INTEGRATION_ID = "venmo-email";

export type VenmoActivityKind =
    | "paymentReceived"
    | "paymentSent"
    | "standardTransfer";

export type VenmoActivityMatchStatus =
    | "autoMatched"
    | "conflict"
    | "error"
    | "manualMatched"
    | "needsAccount"
    | "posted"
    | "unmatched";

export type VenmoParsedActivity = {
    amountCents: number;
    counterpartyHandle?: string;
    counterpartyName?: string;
    destinationInstitution?: string;
    destinationLast4?: string;
    estimatedArrivalDate?: string;
    fundingInstitution?: string;
    fundingLast4?: string;
    fundingMethod?: string;
    kind: VenmoActivityKind;
    memo?: string;
    occurredDate: string;
    providerTransactionId: string;
    status?: string;
    transactionUrl?: string;
};

export function createVenmoActivityId(activity: VenmoParsedActivity) {
    return `${activity.kind}:${activity.providerTransactionId}`;
}

export function normalizeVenmoInstitution(value: string) {
    return value
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .toLowerCase();
}

export function createVenmoExternalAccountKey(input: {
    institution: string;
    last4: string;
}) {
    return `${normalizeVenmoInstitution(input.institution)}:${input.last4}`;
}

export function venmoFinancialDetailsEqual(
    left: VenmoParsedActivity,
    right: VenmoParsedActivity,
) {
    return (
        left.amountCents === right.amountCents &&
        left.kind === right.kind &&
        left.occurredDate === right.occurredDate &&
        left.fundingInstitution === right.fundingInstitution &&
        left.fundingLast4 === right.fundingLast4 &&
        left.destinationInstitution === right.destinationInstitution &&
        left.destinationLast4 === right.destinationLast4
    );
}
