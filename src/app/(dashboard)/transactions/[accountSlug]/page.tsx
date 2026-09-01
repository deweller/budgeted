import { TransactionsWorkspace } from "@/components/workspace/workspace-views";

export default async function TransactionsAccountPage({
    params,
}: {
    params: Promise<{ accountSlug: string }>;
}) {
    const { accountSlug } = await params;

    return <TransactionsWorkspace accountSlug={accountSlug} />;
}
