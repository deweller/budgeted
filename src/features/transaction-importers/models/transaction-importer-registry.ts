import { amazonTransactionImporter } from "@/features/transaction-importers/models/amazon-transaction-importer";
import type {
    TransactionImportActivityRecord,
    TransactionImporterAdapter,
    TransactionImporterId,
} from "@/features/transaction-importers/models/transaction-importer-contract";
import { parseTransactionImportDetails } from "@/features/transaction-importers/models/transaction-importer-contract";
import { venmoTransactionImporter } from "@/features/transaction-importers/models/venmo-transaction-importer";

type AnyTransactionImporterAdapter = TransactionImporterAdapter<unknown, unknown>;

const registeredTransactionImporters = {
    amazon: amazonTransactionImporter,
    venmo: venmoTransactionImporter,
} satisfies Record<TransactionImporterId, object>;

export const transactionImporterRegistry =
    registeredTransactionImporters as unknown as Record<
        TransactionImporterId,
        AnyTransactionImporterAdapter
    >;

export function getTransactionImporter(provider: TransactionImporterId) {
    return transactionImporterRegistry[provider];
}

export function presentTransactionImportActivity(
    activity: TransactionImportActivityRecord,
) {
    const adapter = getTransactionImporter(activity.provider);
    const details = parseTransactionImportDetails(adapter, activity);

    return adapter.present(activity, details);
}
