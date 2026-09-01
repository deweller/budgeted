import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import { HttpError } from "@/lib/api/errors";
import { getLinkedFunctionName } from "@/lib/db/resource";

const AUTOMATION_HANDLER_RESOURCE_NAME = "AutomationHandler";

export async function invokeQueuedAutomationWorker() {
    const functionName = getLinkedFunctionName(AUTOMATION_HANDLER_RESOURCE_NAME);

    if (!functionName) {
        throw new HttpError(
            503,
            "automation_worker_unavailable",
            "The automation worker is not available.",
        );
    }

    await new LambdaClient({}).send(
        new InvokeCommand({
            FunctionName: functionName,
            InvocationType: "Event",
            Payload: new TextEncoder().encode(JSON.stringify({ mode: "queued" })),
        }),
    );
}
