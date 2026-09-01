import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import type { YnabImportWorkerAction } from "@/features/import/ynab/server/ynab-import-job-service";
import { HttpError } from "@/lib/api/errors";
import { getLinkedFunctionName } from "@/lib/db/resource";

export async function invokeYnabImportWorker(input: {
    action: YnabImportWorkerAction;
    jobId: string;
}) {
    const functionName = getLinkedFunctionName("YnabImportWorker");

    if (!functionName) {
        throw new HttpError(
            503,
            "ynab_import_worker_unavailable",
            "The YNAB import worker is not available.",
        );
    }

    await new LambdaClient({}).send(
        new InvokeCommand({
            FunctionName: functionName,
            InvocationType: "Event",
            Payload: new TextEncoder().encode(JSON.stringify(input)),
        }),
    );
}
