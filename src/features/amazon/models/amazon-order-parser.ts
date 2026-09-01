import { createHash } from "node:crypto";

export type AmazonOrderImportRecord = {
    amazonOrderId: string;
    grandTotalCents?: number;
    itemSummary: string;
    itemTitles: string[];
    orderNumber: string;
    orderPlacedDate?: string;
    sourcePayloadJson: string;
};

export type AmazonPaymentImportRecord = {
    amazonPaymentId: string;
    amountCents: number;
    completedDate: string;
    isRefund: boolean;
    itemSummary: string;
    orderNumber: string;
    paymentMethod?: string;
    paymentMethodLast4?: string;
    seller?: string;
    sourcePayloadJson: string;
};

export type AmazonOrdersImport = {
    orders: AmazonOrderImportRecord[];
    payments: AmazonPaymentImportRecord[];
};

type RawAmazonOrder = {
    grand_total?: unknown;
    items?: RawAmazonOrderItem[];
    order_number?: unknown;
    order_placed_date?: unknown;
    transactions?: RawAmazonPayment[];
};

type RawAmazonOrderItem = {
    title?: unknown;
};

type RawAmazonPayment = {
    completed_date?: unknown;
    grand_total?: unknown;
    is_refund?: unknown;
    order_number?: unknown;
    payment_method?: unknown;
    payment_method_last_4?: unknown;
    seller?: unknown;
};

function toOptionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toCents(value: unknown) {
    if (typeof value !== "number" && typeof value !== "string") {
        return undefined;
    }

    const amount = Number(value);

    return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
}

function hashIdentity(parts: unknown[]) {
    const hash = createHash("sha1")
        .update(parts.map((part) => String(part ?? "")).join("\u001f"))
        .digest("hex")
        .slice(0, 24);

    return `amazon-payment-${hash}`;
}

export function summarizeAmazonItems(titles: string[], limit = 2) {
    if (titles.length === 0) {
        return "No item details";
    }

    const visibleTitles = titles.slice(0, limit);
    const remainingCount = titles.length - visibleTitles.length;

    return remainingCount > 0
        ? `${visibleTitles.join("; ")}; +${remainingCount} more`
        : visibleTitles.join("; ");
}

function parseOrderItems(order: RawAmazonOrder) {
    return (Array.isArray(order.items) ? order.items : [])
        .map((item) => toOptionalString(item.title))
        .filter((title): title is string => Boolean(title));
}

function parsePayment(input: {
    itemSummary: string;
    orderNumber: string;
    payment: RawAmazonPayment;
}): AmazonPaymentImportRecord | null {
    const orderNumber =
        toOptionalString(input.payment.order_number) ?? input.orderNumber;
    const completedDate = toOptionalString(input.payment.completed_date);
    const amountCents = toCents(input.payment.grand_total);

    if (!orderNumber || !completedDate || amountCents === undefined) {
        return null;
    }

    const paymentMethod = toOptionalString(input.payment.payment_method);
    const paymentMethodLast4 = toOptionalString(
        input.payment.payment_method_last_4,
    );
    const seller = toOptionalString(input.payment.seller);
    const isRefund = input.payment.is_refund === true;

    return {
        amazonPaymentId: hashIdentity([
            orderNumber,
            completedDate,
            amountCents,
            paymentMethod,
            paymentMethodLast4,
            seller,
            isRefund,
        ]),
        amountCents,
        completedDate,
        isRefund,
        itemSummary: input.itemSummary,
        orderNumber,
        paymentMethod,
        paymentMethodLast4,
        seller,
        sourcePayloadJson: JSON.stringify(input.payment),
    };
}

function parseOrder(order: RawAmazonOrder): {
    order: AmazonOrderImportRecord;
    payments: AmazonPaymentImportRecord[];
} | null {
    const orderNumber = toOptionalString(order.order_number);

    if (!orderNumber) {
        return null;
    }

    const itemTitles = parseOrderItems(order);
    const itemSummary = summarizeAmazonItems(itemTitles);

    return {
        order: {
            amazonOrderId: orderNumber,
            grandTotalCents: toCents(order.grand_total),
            itemSummary,
            itemTitles,
            orderNumber,
            orderPlacedDate: toOptionalString(order.order_placed_date),
            sourcePayloadJson: JSON.stringify(order),
        },
        payments: (Array.isArray(order.transactions) ? order.transactions : [])
            .map((payment) =>
                parsePayment({
                    itemSummary,
                    orderNumber,
                    payment,
                }),
            )
            .filter(
                (payment): payment is AmazonPaymentImportRecord =>
                    payment !== null,
            ),
    };
}

export function parseAmazonOrdersPayload(payload: unknown): AmazonOrdersImport {
    const rawOrders =
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { orders?: unknown }).orders)
            ? ((payload as { orders: RawAmazonOrder[] }).orders)
            : [];
    const parsedOrders = rawOrders
        .map(parseOrder)
        .filter((order): order is NonNullable<typeof order> => order !== null);

    return {
        orders: parsedOrders.map((entry) => entry.order),
        payments: parsedOrders.flatMap((entry) => entry.payments),
    };
}
