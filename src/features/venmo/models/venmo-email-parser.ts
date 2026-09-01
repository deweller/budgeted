import { convert } from "html-to-text";
import PostalMime, { type Address, type Email } from "postal-mime";

import type { VenmoParsedActivity } from "@/features/venmo/models/venmo-activity";

export type VenmoEmailParseResult =
    | { disposition: "activity"; activity: VenmoParsedActivity; messageId?: string; subject: string }
    | { disposition: "ignored"; messageId?: string; subject: string }
    | { disposition: "malformed"; message: string; messageId?: string; subject: string };

type VenmoEmailParserOptions = {
    allowedForwarders?: readonly string[];
};

const VENMO_SENDER = "venmo@venmo.com";

function normalizeText(value: string) {
    return value
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function venmoHtmlToText(html: string) {
    return normalizeText(
        convert(html, {
            selectors: [
                { selector: "img", format: "skip" },
                { selector: "a", options: { ignoreHref: true } },
            ],
            wordwrap: false,
        }),
    );
}

function mailboxAddress(address: Address | undefined) {
    return address && "address" in address && address.address
        ? address.address.toLowerCase()
        : undefined;
}

function normalizedForwarders(options: VenmoEmailParserOptions) {
    return new Set(
        (options.allowedForwarders ?? []).map((address) =>
            address.trim().toLowerCase(),
        ),
    );
}

function forwardedSubject(subject: string) {
    return subject.replace(/^(?:(?:fwd?|fw):\s*)+/i, "").trim();
}

function hasEmbeddedVenmoSender(text: string) {
    return /(?:^|\n)From:\s*Venmo\s*<[^\n>]*venmo@venmo\.com[^\n>]*>/i.test(
        text,
    );
}

function parseMoney(value: string) {
    const normalized = value.replace(/,/g, "");
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);

    if (!match) return undefined;

    return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

const MONTH_NAMES = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];

function monthNumber(value: string) {
    const normalized = value.toLowerCase();
    return (
        MONTH_NAMES.findIndex(
            (month) => month === normalized || month.slice(0, 3) === normalized,
        ) + 1
    );
}

function toIsoDate(value: string) {
    const withoutWeekday = value.replace(/^[A-Za-z]+,\s*/, "").trim();
    const match = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(withoutWeekday);
    const month = match ? monthNumber(match[1]!) : 0;

    if (!match || month < 1) return undefined;

    return `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

function field(text: string, label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\n)${escaped}\\n+([^\\n]+)`, "i").exec(text)?.[1]?.trim();
}

function transactionUrl(email: Email) {
    const html = email.html ?? "";
    return /href=["'](https:\/\/venmo\.com\/story\/[^"']+)/i.exec(html)?.[1];
}

function bodyMemo(text: string, heading: string) {
    const start = text.toLowerCase().lastIndexOf(heading.toLowerCase());
    if (start < 0) return undefined;
    const afterHeading = text.slice(start + heading.length).trimStart();
    const amountEnd = /^\$\s*\n?\s*[\d,]+\s*\n?\.\s*\n?\s*\d{2}\s*\n+/m.exec(afterHeading);
    if (!amountEnd) return undefined;
    const afterAmount = afterHeading.slice(amountEnd.index + amountEnd[0].length);
    const memo = afterAmount.split(/\n(?:See transaction|MONEY CREDITED|TRANSACTION DETAILS)\b/i)[0]?.trim();
    return memo || undefined;
}

function parsePayment(email: Email, text: string, subject: string): VenmoParsedActivity | undefined {
    const sent = /^You paid (.+) \$([\d,]+\.\d{2})$/i.exec(subject);
    const received = /^(.+) paid you \$([\d,]+\.\d{2})$/i.exec(subject);
    const match = sent ?? received;
    if (!match) return undefined;

    const amountCents = parseMoney(match[2]!);
    const occurredDate = toIsoDate(field(text, "DATE") ?? "");
    const providerTransactionId = field(text, "TRANSACTION ID");
    if (!amountCents || !occurredDate || !providerTransactionId || !/^[A-Za-z0-9-]+$/.test(providerTransactionId)) return undefined;

    const paymentMethod = sent ? field(text, "PAYMENT METHOD") : undefined;
    const funding = paymentMethod
        ? /^(.*?)\s+(?:account|card) ending in (\d{4})$/i.exec(paymentMethod)
        : undefined;
    const heading = sent ? `You paid ${match[1]}` : `${match[1]} paid you`;

    return {
        amountCents,
        counterpartyName: match[1]!.trim(),
        kind: sent ? "paymentSent" : "paymentReceived",
        memo: bodyMemo(text, heading),
        occurredDate,
        providerTransactionId,
        status: sent ? field(text, "STATUS") : undefined,
        transactionUrl: transactionUrl(email),
        ...(sent
            ? {
                  fundingMethod: paymentMethod,
                  fundingInstitution: funding?.[1]?.trim(),
                  fundingLast4: funding?.[2],
                  counterpartyHandle: field(text, "SENT FROM"),
              }
            : { counterpartyHandle: field(text, "SENT TO") }),
    };
}

function parseTransfer(text: string, subject: string): VenmoParsedActivity | undefined {
    if (!/^Your Venmo Standard transfer has been initiated$/i.test(subject)) return undefined;

    const amountCents = parseMoney((field(text, "TRANSFER AMOUNT") ?? "").replace(/^\$/, ""));
    const occurredDate = toIsoDate(field(text, "INITIATED ON") ?? "");
    const providerTransactionId = field(text, "TRANSFER TRANSACTION ID");
    const destination = /^(.*?)\s+[·•]+\s*(\d{4})$/.exec(field(text, "DESTINATION") ?? "");
    if (!amountCents || !occurredDate || !providerTransactionId || !/^[A-Za-z0-9-]+$/.test(providerTransactionId) || !destination) return undefined;

    return {
        amountCents,
        destinationInstitution: destination[1]!.trim(),
        destinationLast4: destination[2],
        estimatedArrivalDate: toIsoDate(field(text, "ESTIMATED ARRIVAL") ?? ""),
        kind: "standardTransfer",
        occurredDate,
        providerTransactionId,
    };
}

function isFinancialSubject(subject: string) {
    return /^(?:You paid .+ \$[\d,]+\.\d{2}|.+ paid you \$[\d,]+\.\d{2}|Your Venmo Standard transfer has been initiated)$/i.test(subject);
}

export async function parseVenmoEmail(
    rawMime: Uint8Array | Buffer | string,
    options: VenmoEmailParserOptions = {},
): Promise<VenmoEmailParseResult> {
    const email = await PostalMime.parse(rawMime);
    const sender = mailboxAddress(email.from);
    const isDirectVenmoMessage = sender === VENMO_SENDER;
    const isTrustedForward = Boolean(
        sender && normalizedForwarders(options).has(sender),
    );
    const subject = isTrustedForward
        ? forwardedSubject(email.subject?.trim() ?? "")
        : (email.subject?.trim() ?? "");
    const common = { messageId: email.messageId, subject };

    if (!isDirectVenmoMessage && !isTrustedForward) {
        return { disposition: "malformed", ...common, message: "The message From address is not an allowed Venmo sender." };
    }

    const text = venmoHtmlToText(email.html ?? email.text ?? "");
    if (isTrustedForward && !hasEmbeddedVenmoSender(text)) {
        return { disposition: "malformed", ...common, message: "The trusted forward does not contain an embedded venmo@venmo.com sender." };
    }

    if (!isFinancialSubject(subject)) return { disposition: "ignored", ...common };

    const activity = parsePayment(email, text, subject) ?? parseTransfer(text, subject);
    return activity
        ? { disposition: "activity", ...common, activity }
        : { disposition: "malformed", ...common, message: "The Venmo financial email is missing required fields." };
}
