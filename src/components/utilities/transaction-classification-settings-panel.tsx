"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";

import { ComboboxSelect } from "@/components/shared/combobox-select";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import { formatAccountTypeLabel } from "@/modules/accounts/account-types";

type ClassificationModelOption = {
    label: string;
    modelId: string;
    provider: "google" | "openai";
};

type SettingsResponse = {
    availableModels: ClassificationModelOption[];
    modelId: string | null;
    systemInstructions: string;
};

type ClassifyNowResponse = {
    categoryCount: number;
    eligibleCount: number;
    errorCount: number;
    errors: string[];
    noSuggestionCount: number;
    savedCount: number;
    skippedCount: number;
};

export function TransactionClassificationSettingsPanel() {
    const { snapshot } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [availableModels, setAvailableModels] = useState<
        ClassificationModelOption[]
    >([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isClassifyingNow, setIsClassifyingNow] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [classifyNowResult, setClassifyNowResult] =
        useState<ClassifyNowResponse | null>(null);
    const [classifyNowAccountId, setClassifyNowAccountId] = useState("");
    const [modelId, setModelId] = useState<string | null>(null);
    const [systemInstructions, setSystemInstructions] = useState("");
    const accountOptions = useMemo(
        () =>
            [...snapshot.accounts]
                .sort((left, right) => left.name.localeCompare(right.name))
                .map((account) => ({
                    description: formatAccountTypeLabel(account.accountType),
                    label: account.name,
                    value: account.accountId,
                })),
        [snapshot.accounts],
    );
    const selectedClassifyNowAccountId = accountOptions.some(
        (option) => option.value === classifyNowAccountId,
    )
        ? classifyNowAccountId
        : "";
    useEffect(() => {
        let isMounted = true;

        async function loadSettings() {
            try {
                const response = await fetch(
                    "/api/utilities/transaction-classification-settings",
                );

                if (!response.ok) {
                    throw response;
                }

                const payload = (await response.json()) as SettingsResponse;

                if (isMounted) {
                    setAvailableModels(payload.availableModels ?? []);
                    setModelId(
                        payload.modelId ??
                            payload.availableModels?.[0]?.modelId ??
                            null,
                    );
                    setSystemInstructions(payload.systemInstructions);
                }
            } catch (error) {
                if (isMounted) {
                    notifyError({
                        message:
                            error instanceof Response
                                ? await parseApiErrorMessage(
                                      error,
                                      "Unable to load AI classification settings.",
                                  )
                                : error instanceof Error
                                  ? error.message
                                  : "Unable to load AI classification settings.",
                        title: "Settings could not be loaded.",
                    });
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void loadSettings();

        return () => {
            isMounted = false;
        };
    }, [notifyError]);

    async function classifyNow() {
        if (!selectedClassifyNowAccountId) {
            return;
        }

        setIsClassifyingNow(true);
        setClassifyNowResult(null);
        const activity = startActivity({
            completedLabel: "AI classifications saved.",
            pendingLabel: "Classifying transactions…",
        });

        try {
            const response = await fetch(
                "/api/utilities/transaction-classification/classify-now",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        accountId: selectedClassifyNowAccountId,
                    }),
                },
            );

            if (!response.ok) {
                throw response;
            }

            const payload = (await response.json()) as ClassifyNowResponse;

            setClassifyNowResult(payload);
            activity.complete();

            if (payload.errorCount > 0) {
                notifyError({
                    message:
                        payload.errors[0] ??
                        "One or more transactions could not be classified.",
                    title: `${payload.errorCount.toLocaleString()} classification${
                        payload.errorCount === 1 ? "" : "s"
                    } failed.`,
                });
            }
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to classify transactions.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to classify transactions.",
                title: "Classification failed.",
            });
        } finally {
            setIsClassifyingNow(false);
        }
    }

    async function saveSettings(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSaving(true);
        const activity = startActivity({
            completedLabel: "AI classification settings saved.",
            pendingLabel: "Saving AI classification settings…",
        });

        try {
            const response = await fetch(
                "/api/utilities/transaction-classification-settings",
                {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        ...(modelId ? { modelId } : {}),
                        systemInstructions,
                    }),
                },
            );

            if (!response.ok) {
                throw response;
            }

            const payload = (await response.json()) as SettingsResponse;
            const responseAvailableModels =
                payload.availableModels ?? availableModels;

            setAvailableModels(responseAvailableModels);
            setModelId(
                payload.modelId ?? responseAvailableModels[0]?.modelId ?? null,
            );
            setSystemInstructions(payload.systemInstructions);
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to save AI classification settings.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to save AI classification settings.",
                title: "Settings could not be saved.",
            });
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <form
            onSubmit={(event) => void saveSettings(event)}
            className={`grid gap-5 p-5 ${surfaceClassNames.panel}`}
        >
            <div className="grid gap-1">
                <p className={typographyClassNames.eyebrow}>
                    AI classification
                </p>
                <h1 className="text-2xl font-semibold">AI Classification</h1>
            </div>

            <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                Additional system prompt instructions
                <textarea
                    disabled={isLoading || isSaving}
                    value={systemInstructions}
                    onChange={(event) =>
                        setSystemInstructions(event.target.value)
                    }
                    rows={8}
                    className={`${controlClassNames.field} min-h-44`}
                />
                <span className="text-xs font-normal text-[var(--color-muted)]">
                    Use this to give the AI durable classification rules and
                    preferences that should apply to every model request.
                </span>
            </label>

            <div className="grid gap-2">
                <p className="text-sm font-medium text-[var(--color-ink)]">
                    Classification model
                </p>
                {availableModels.length > 0 ? (
                    <div
                        role="radiogroup"
                        aria-label="Classification model"
                        className="grid gap-2 sm:grid-cols-2"
                    >
                        {availableModels.map((model) => (
                            <label
                                key={`${model.provider}-${model.modelId}`}
                                className={`flex cursor-pointer items-center gap-3 border p-3 text-sm transition ${
                                    modelId === model.modelId
                                        ? "border-[var(--color-accent-ink)] bg-[var(--color-panel-strong)] text-[var(--color-ink)]"
                                        : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:border-[var(--color-accent-ink)] hover:text-[var(--color-ink)]"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="classificationModel"
                                    value={model.modelId}
                                    checked={modelId === model.modelId}
                                    disabled={isLoading || isSaving}
                                    onChange={() => setModelId(model.modelId)}
                                    className="size-4 cursor-pointer"
                                />
                                <span className="grid gap-0.5">
                                    <span className="font-medium">
                                        {model.label}
                                    </span>
                                    <span className="text-xs text-[var(--color-muted)]">
                                        {model.modelId}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-[var(--color-muted)]">
                        No classification model API key is configured.
                    </p>
                )}
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isLoading || isSaving}
                    className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.primaryActionCompact}`}
                >
                    {isSaving ? "Saving..." : "Save settings"}
                </button>
            </div>

            <div className="grid gap-3 border-t border-[var(--color-border)] pt-5">
                <div className="grid gap-1">
                    <p className="text-sm font-medium text-[var(--color-ink)]">
                        Classify Now
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                        Create AI classifications for eligible unclassified
                        transactions in one account.
                    </p>
                </div>
                <ComboboxSelect
                    disabled={isClassifyingNow || accountOptions.length === 0}
                    inputClassName={`${controlClassNames.fieldCompact} w-full`}
                    label="Account"
                    noResultsLabel="No accounts found"
                    onChange={(value) => {
                        setClassifyNowAccountId(value);
                        setClassifyNowResult(null);
                    }}
                    options={accountOptions}
                    placeholder="Choose an account"
                    value={selectedClassifyNowAccountId}
                />
                {accountOptions.length === 0 ? (
                    <p className="text-sm text-[var(--color-muted)]">
                        Add an account before running classification.
                    </p>
                ) : null}
                <div>
                    <button
                        type="button"
                        disabled={
                            isClassifyingNow || !selectedClassifyNowAccountId
                        }
                        onClick={() => void classifyNow()}
                        className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.primaryActionCompact}`}
                    >
                        <FontAwesomeIcon aria-hidden icon={faRobot} />
                        {isClassifyingNow ? "Classifying..." : "Classify"}
                    </button>
                </div>
                {classifyNowResult ? (
                    <dl className="grid gap-2 text-xs text-[var(--color-muted)] sm:grid-cols-5">
                        <ClassifyResultItem
                            label="Eligible"
                            value={classifyNowResult.eligibleCount}
                        />
                        <ClassifyResultItem
                            label="Saved"
                            value={classifyNowResult.savedCount}
                        />
                        <ClassifyResultItem
                            label="Category"
                            value={classifyNowResult.categoryCount}
                        />
                        <ClassifyResultItem
                            label="No suggestion"
                            value={classifyNowResult.noSuggestionCount}
                        />
                        <ClassifyResultItem
                            label="Skipped / failed"
                            value={`${classifyNowResult.skippedCount.toLocaleString()} / ${classifyNowResult.errorCount.toLocaleString()}`}
                        />
                    </dl>
                ) : null}
            </div>
        </form>
    );
}

function ClassifyResultItem({
    label,
    value,
}: {
    label: string;
    value: number | string;
}) {
    return (
        <div>
            <dt className="font-semibold text-[var(--color-ink)]">{label}</dt>
            <dd>{typeof value === "number" ? value.toLocaleString() : value}</dd>
        </div>
    );
}
