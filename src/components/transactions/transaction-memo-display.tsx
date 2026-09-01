import type {
    TransactionImportPresentation,
    TransactionImportReferenceField,
} from "@/features/transaction-importers/models/transaction-importer-contract";
import { presentTransactionImportActivity } from "@/features/transaction-importers/models/transaction-importer-registry";
import type { WorkspaceTransactionImportActivityRecord } from "@/lib/workspace/sync-types";

export type TransactionManagedMetadataSource = {
    importActivities?: readonly WorkspaceTransactionImportActivityRecord[];
};

type PresentedImportActivity = {
    activity: WorkspaceTransactionImportActivityRecord;
    presentation: TransactionImportPresentation;
};

function getPresentedImportActivities(
    transaction: TransactionManagedMetadataSource,
): PresentedImportActivity[] {
    return (transaction.importActivities ?? []).flatMap((activity) => {
        try {
            return [{ activity, presentation: presentTransactionImportActivity(activity) }];
        } catch {
            return [];
        }
    });
}

export function TransactionProviderRecordId({
    label,
    truncate = false,
    value,
}: {
    label?: string;
    truncate?: boolean;
    value: string;
}) {
    return (
        <span
            className={`text-[0.75em] text-[var(--color-muted)] ${
                truncate ? "min-w-0 shrink-[999] truncate" : "shrink-0"
            }`}
        >
            {label ? <span className="font-normal">{label}: </span> : null}
            <span className="font-mono">{value}</span>
        </span>
    );
}

function ImportActivitySummary({
    presentation,
    showIdentifierLabel,
    showFullSummary,
}: {
    presentation: TransactionImportPresentation;
    showIdentifierLabel: boolean;
    showFullSummary: boolean;
}) {
    return (
        <span
            className={`items-baseline gap-1 ${
                showFullSummary
                    ? "inline-flex w-full min-w-0 flex-wrap whitespace-normal break-words"
                    : "flex w-full min-w-0 overflow-hidden"
            }`}
            data-managed-import-summary=""
        >
            <span
                className={
                    showFullSummary
                        ? "min-w-0 break-words"
                        : "min-w-0 max-w-full shrink-0 truncate"
                }
            >
                {presentation.summary.text}
            </span>
            <TransactionProviderRecordId
                label={showIdentifierLabel ? "Transaction ID" : undefined}
                truncate={!showFullSummary}
                value={presentation.summary.identifier}
            />
        </span>
    );
}

export function TransactionMemoDisplay({
    emptyPlaceholder = "-",
    managedMetadata,
    memo,
    displaySize = "compact",
    showFullMemo = false,
}: {
    displaySize?: "compact" | "regular";
    emptyPlaceholder?: string;
    managedMetadata?: TransactionManagedMetadataSource;
    memo?: string;
    showFullMemo?: boolean;
}) {
    const trimmedMemo = memo?.trim();
    const metadata = managedMetadata ?? {};
    const hasManagedMetadata = hasTransactionManagedMetadata(metadata);

    if (!trimmedMemo && !hasManagedMetadata) {
        return <span className="leading-5 text-[var(--color-muted)]">{emptyPlaceholder}</span>;
    }

    const title = [trimmedMemo, ...getManagedMetadataSummaryText(metadata)]
        .filter(Boolean)
        .join(" · ");

    return (
        <span
            title={title}
            className={`min-w-0 max-w-full leading-5 text-[var(--color-muted)] ${
                showFullMemo
                    ? "grid gap-1 whitespace-normal"
                    : "flex w-full items-baseline gap-2 overflow-hidden whitespace-nowrap"
            }`}
        >
            {trimmedMemo ? (
                <span
                    className={
                        showFullMemo
                            ? "min-w-0 whitespace-normal whitespace-pre-wrap break-words"
                            : `min-w-0 truncate ${
                                  hasManagedMetadata
                                      ? "max-w-[50ch] shrink-0"
                                      : "max-w-full shrink"
                              }`
                    }
                >
                    {trimmedMemo}
                </span>
            ) : null}
            {trimmedMemo && hasManagedMetadata && !showFullMemo ? (
                <span
                    aria-hidden="true"
                    className="w-px shrink-0 self-stretch border-l border-[var(--color-border)]/70"
                    data-memo-managed-separator=""
                />
            ) : null}
            <TransactionManagedMetadataSummaries
                displaySize={displaySize}
                showIdentifierLabel={showFullMemo}
                showFullSummary={showFullMemo}
                transaction={metadata}
            />
        </span>
    );
}

function getManagedMetadataSummaryText(
    transaction: TransactionManagedMetadataSource,
) {
    const presentedActivities = getPresentedImportActivities(transaction);
    return [
        ...presentedActivities.map(
            ({ presentation }) =>
                `${presentation.summary.text} ${presentation.summary.identifier}`,
        ),
    ];
}

function TransactionManagedMetadataSummaries({
    displaySize,
    showIdentifierLabel,
    showFullSummary,
    transaction,
}: {
    displaySize: "compact" | "regular";
    showIdentifierLabel: boolean;
    showFullSummary: boolean;
    transaction: TransactionManagedMetadataSource;
}) {
    const presentedActivities = getPresentedImportActivities(transaction);

    return (
        <>
            {presentedActivities.map(({ activity, presentation }) => (
                <span
                    className={`${displaySize === "regular" ? "text-sm" : "text-xs"} ${
                        showFullSummary
                            ? "block w-full"
                            : "flex min-w-0 flex-1 leading-5"
                    }`}
                    key={activity.activityId}
                >
                    <ImportActivitySummary
                        presentation={presentation}
                        showIdentifierLabel={showIdentifierLabel}
                        showFullSummary={showFullSummary}
                    />
                </span>
            ))}
        </>
    );
}

export function hasTransactionManagedMetadata(
    transaction: TransactionManagedMetadataSource,
) {
    return (
        getPresentedImportActivities(transaction).length > 0
    );
}

export function TransactionManagedMetadataReadonly<
    TTransaction extends TransactionManagedMetadataSource,
>({
    displaySize = "compact",
    showLabel = true,
    showSummaryIdentifierLabel = false,
    transaction,
}: {
    displaySize?: "compact" | "regular";
    showLabel?: boolean;
    showSummaryIdentifierLabel?: boolean;
    transaction: TTransaction;
}) {
    if (!hasTransactionManagedMetadata(transaction)) {
        return null;
    }

    const presentedActivities = getPresentedImportActivities(transaction);

    return (
        <span className="mt-1 grid w-full gap-1" data-managed-transaction-metadata="">
            {showLabel ? (
                <span className="font-medium text-[var(--color-ink)]">
                    Managed transaction information
                </span>
            ) : null}
            {presentedActivities.map(({ activity, presentation }) => (
                <span
                    className={`mt-1 grid w-full gap-0.5 font-normal text-[var(--color-muted)] ${
                        displaySize === "regular" ? "text-sm" : "text-xs"
                    }`}
                    data-managed-import-provider={activity.provider}
                    key={activity.activityId}
                >
                    <ImportActivitySummary
                        presentation={presentation}
                        showIdentifierLabel={showSummaryIdentifierLabel}
                        showFullSummary
                    />
                </span>
            ))}
        </span>
    );
}

export function getTransactionManagedReferenceFields(
    transaction: TransactionManagedMetadataSource,
): TransactionImportReferenceField[] {
    const presentedActivities = getPresentedImportActivities(transaction);
    const fields = presentedActivities.flatMap(
        ({ presentation }) => presentation.referenceFields,
    );
    return fields;
}
