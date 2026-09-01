import { HttpError } from "@/lib/api/errors";
import { getLinkedSecret } from "@/lib/db/resource";

export type AmazonScraperManifest = {
    lastError?: string | null;
    lastSuccessfulSyncAt?: string | null;
    orderCount?: number;
    state?: string;
    syncId?: string;
    task?: {
        arn?: string | null;
        status?: string | null;
    } | null;
    updatedAt?: string;
};

export type AmazonScraperLaunchResult = {
    manifest?: AmazonScraperManifest;
    syncId?: string;
    taskArn?: string;
    taskStatus?: string;
};

type AmazonScraperClientConfig = {
    apiToken: string;
    apiUrl: string;
};

function getAmazonScraperClientConfig(): AmazonScraperClientConfig {
    const apiUrl =
        getLinkedSecret("AmazonOrderScraperApiUrl") ??
        process.env.AMAZON_ORDER_SCRAPER_API_URL;
    const apiToken =
        getLinkedSecret("AmazonOrderScraperApiToken") ??
        process.env.AMAZON_ORDER_SCRAPER_API_TOKEN;

    if (!apiUrl || !apiToken) {
        throw new HttpError(
            500,
            "amazon_scraper_not_configured",
            "Amazon order scraper API settings are not configured.",
        );
    }

    return {
        apiToken,
        apiUrl,
    };
}

function createAmazonScraperUrl(apiUrl: string, path: string) {
    return new URL(path.replace(/^\//, ""), `${apiUrl.replace(/\/+$/, "")}/`);
}

async function requestAmazonScraperJson<T>(path: string, init: RequestInit = {}) {
    const config = getAmazonScraperClientConfig();
    const response = await fetch(createAmazonScraperUrl(config.apiUrl, path), {
        ...init,
        headers: {
            ...init.headers,
            Authorization: `Bearer ${config.apiToken}`,
        },
    });

    if (!response.ok) {
        throw new HttpError(
            response.status,
            "amazon_scraper_request_failed",
            "Amazon order scraper request failed.",
        );
    }

    return (await response.json()) as T;
}

export async function fetchAmazonScraperManifest() {
    return requestAmazonScraperJson<AmazonScraperManifest>("/manifest");
}

export async function fetchAmazonScraperOrders() {
    return requestAmazonScraperJson<unknown>("/orders");
}

export async function launchAmazonScraperSync() {
    return requestAmazonScraperJson<AmazonScraperLaunchResult>("/launch", {
        method: "POST",
    });
}
