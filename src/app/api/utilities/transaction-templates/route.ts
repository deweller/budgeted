import { transactionTemplateInputSchema } from "@/features/transaction-templates/models/transaction-template";
import {
    createTransactionTemplateWithWorkspaceChanges,
    listTransactionTemplates,
} from "@/features/transaction-templates/server/transaction-template-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
    workspaceReadJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function GET() {
    return workspaceReadJson((context) =>
        listTransactionTemplates(context.ledgerId),
    );
}

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(request, transactionTemplateInputSchema);

        return workspacePublishedMutationJson(
            context,
            async () => {
                const result = await createTransactionTemplateWithWorkspaceChanges(
                    context.ledgerId,
                    input,
                );

                return {
                    ...result.template,
                    workspaceChanges: result.workspaceChanges,
                };
            },
            { status: 201 },
        );
    });
}
