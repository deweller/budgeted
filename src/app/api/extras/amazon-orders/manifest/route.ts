import { workspaceReadJson } from "@/lib/api/workspace-route";
import { readAmazonScraperManifest } from "@/features/amazon/server/amazon-order-service";

export async function GET() {
    return workspaceReadJson(() => readAmazonScraperManifest());
}
