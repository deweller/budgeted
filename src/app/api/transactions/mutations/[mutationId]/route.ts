import {
    findWorkspaceMutationBatch,
    findWorkspaceMutationOperation,
} from "@/features/workspace/server/workspace-sync-service";
import { HttpError } from "@/lib/api/errors";
import { workspaceReadJson } from "@/lib/api/workspace-route";

const mutationTypes = {
    bulkDelete: "transaction.bulkDelete",
    categorize: "transaction.categorize",
} as const;

function getMutationType(request: Request) {
    const operation = new URL(request.url).searchParams.get("operation");

    if (!operation || !(operation in mutationTypes)) {
        throw new HttpError(
            422,
            "workspace_mutation_operation_invalid",
            "Specify a supported workspace mutation operation.",
        );
    }

    return mutationTypes[operation as keyof typeof mutationTypes];
}

export async function GET(
    request: Request,
    context: { params: Promise<{ mutationId: string }> },
) {
    return workspaceReadJson(async (workspaceContext) => {
        const { mutationId } = await context.params;
        const mutationType = getMutationType(request);
        const batch = await findWorkspaceMutationBatch({
            ledgerId: workspaceContext.ledgerId,
            mutationId,
            mutationType,
        });

        if (batch) {
            return {
                completedStepCount: null,
                status: "completed",
            };
        }

        const operation = await findWorkspaceMutationOperation({
            ledgerId: workspaceContext.ledgerId,
            mutationId,
            mutationType,
        });

        if (!operation) {
            throw new HttpError(
                404,
                "workspace_mutation_missing",
                "The workspace mutation could not be found.",
            );
        }

        return {
            completedStepCount: operation.completedStepCount,
            status: operation.status,
        };
    });
}
