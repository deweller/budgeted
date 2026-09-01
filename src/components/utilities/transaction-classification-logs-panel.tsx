"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCaretDown,
    faCaretRight,
    faCopy,
    faEye,
} from "@fortawesome/free-solid-svg-icons";

import { DialogCloseButton } from "@/components/shared/dialog-close-button";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

type InteractionRecord = {
    createdAt: string;
    interactionId: string;
    modelId: string;
    promptVersion: string;
    requestText: string;
    responseText: string;
};

type InteractionsResponse = {
    interactions: InteractionRecord[];
};

const INTERACTION_PREVIEW_MAX_CHARACTERS = 1_000;
const INTERACTION_PREVIEW_MAX_LINES = 4;

function toPreviewText(value: string) {
    const lines = value.split(/\r?\n/);
    const lineLimited = lines.slice(0, INTERACTION_PREVIEW_MAX_LINES).join("\n");
    const characterLimited =
        lineLimited.length > INTERACTION_PREVIEW_MAX_CHARACTERS
            ? lineLimited.slice(0, INTERACTION_PREVIEW_MAX_CHARACTERS)
            : lineLimited;
    const isTruncated =
        lines.length > INTERACTION_PREVIEW_MAX_LINES ||
        lineLimited.length > INTERACTION_PREVIEW_MAX_CHARACTERS;

    return `${characterLimited}${isTruncated ? "..." : ""}`;
}

function formatCharacterCount(value: string) {
    return `${value.length.toLocaleString()} character${
        value.length === 1 ? "" : "s"
    }`;
}

function InteractionPreviewBlock({
    label,
    text,
}: {
    label: string;
    text: string;
}) {
    return (
        <div className="grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[var(--color-ink)]">
                    {label}
                </span>
                <span className="text-[var(--color-muted)]">
                    {formatCharacterCount(text)}
                </span>
            </div>
            <pre className="max-h-20 overflow-hidden whitespace-pre-wrap break-words bg-[var(--color-panel-strong)] p-2 text-xs leading-4 text-[var(--color-ink)]">
                {toPreviewText(text)}
            </pre>
        </div>
    );
}

export function TransactionClassificationLogsPanel() {
    const { notifyError, notifySuccessToast } = useFeedbackToasts();
    const [interactions, setInteractions] = useState<InteractionRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedInteraction, setSelectedInteraction] =
        useState<InteractionRecord | null>(null);

    async function loadInteractions() {
        setIsLoading(true);

        try {
            const response = await fetch(
                "/api/utilities/transaction-classification-interactions",
            );

            if (!response.ok) {
                throw response;
            }

            const payload = (await response.json()) as InteractionsResponse;

            setInteractions(payload.interactions);
        } catch (error) {
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to load recent AI interactions.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to load recent AI interactions.",
                title: "Interactions could not be loaded.",
            });
        } finally {
            setIsLoading(false);
        }
    }

    function toggleInteractions() {
        const nextIsExpanded = !isExpanded;

        setIsExpanded(nextIsExpanded);

        if (nextIsExpanded) {
            void loadInteractions();
        } else {
            setInteractions([]);
            setSelectedInteraction(null);
        }
    }

    async function copyToClipboard(label: string, text: string) {
        if (!navigator.clipboard) {
            notifyError({
                message: "Clipboard access is not available in this browser.",
                title: "Copy failed.",
            });

            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            notifySuccessToast(`${label} copied.`);
        } catch (error) {
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to write to the clipboard.",
                title: "Copy failed.",
            });
        }
    }

    return (
        <div className={`grid gap-5 p-5 ${surfaceClassNames.panel}`}>
            <div className="grid gap-1">
                <p className={typographyClassNames.eyebrow}>Debug logs</p>
                <h1 className="text-2xl font-semibold">Logs</h1>
                <p className="text-sm text-[var(--color-muted)]">
                    Review recent AI classifier requests and responses.
                </p>
            </div>

            <div className="border-t border-[var(--color-border)] pt-4">
                <button
                    type="button"
                    aria-controls="recent-ai-interactions"
                    aria-expanded={isExpanded}
                    onClick={toggleInteractions}
                    className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-ink)]"
                >
                    <FontAwesomeIcon
                        aria-hidden
                        className="text-base"
                        icon={isExpanded ? faCaretDown : faCaretRight}
                    />
                    Recent AI interactions
                </button>

                {isExpanded ? (
                    <div id="recent-ai-interactions" className="mt-4 grid gap-3">
                        {interactions.length > 0 ? (
                            <div className="overflow-x-auto border border-[var(--color-border)]">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-[var(--color-panel-strong)] text-left text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">
                                        <tr>
                                            <th className="px-3 py-2">When</th>
                                            <th className="px-3 py-2">Preview</th>
                                            <th className="w-20 px-3 py-2 text-right">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {interactions.map((interaction) => (
                                            <tr
                                                key={interaction.interactionId}
                                                className="border-t border-[var(--color-border)]"
                                            >
                                                <td className="px-3 py-2 align-top text-xs text-[var(--color-muted)]">
                                                    {new Date(
                                                        interaction.createdAt,
                                                    ).toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2 align-top">
                                                    <div className="grid min-w-80 gap-3">
                                                        <InteractionPreviewBlock
                                                            label="Query"
                                                            text={interaction.requestText}
                                                        />
                                                        <InteractionPreviewBlock
                                                            label="Response"
                                                            text={interaction.responseText}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-right align-top">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedInteraction(
                                                                interaction,
                                                            )
                                                        }
                                                        className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.secondaryActionSmall}`}
                                                    >
                                                        <FontAwesomeIcon
                                                            aria-hidden
                                                            icon={faEye}
                                                        />
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-sm text-[var(--color-muted)]">
                                {isLoading
                                    ? "Loading interactions..."
                                    : "No recent AI interactions were found."}
                            </p>
                        )}
                    </div>
                ) : null}
            </div>

            {selectedInteraction ? (
                <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="classification-interaction-title"
                        className={`grid max-h-[90vh] w-full max-w-5xl gap-4 overflow-y-auto p-5 ${surfaceClassNames.panel}`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="grid gap-1">
                                <p className={typographyClassNames.eyebrow}>
                                    AI interaction
                                </p>
                                <h2
                                    id="classification-interaction-title"
                                    className="text-xl font-semibold"
                                >
                                    {selectedInteraction.modelId}
                                </h2>
                                <p className="text-xs text-[var(--color-muted)]">
                                    {new Date(
                                        selectedInteraction.createdAt,
                                    ).toLocaleString()} {" "}
                                    - {selectedInteraction.promptVersion}
                                </p>
                            </div>
                            <DialogCloseButton
                                aria-label="Close AI interaction dialog"
                                onClick={() => setSelectedInteraction(null)}
                            />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <InteractionFullText
                                label="Query"
                                text={selectedInteraction.requestText}
                                onCopy={copyToClipboard}
                            />
                            <InteractionFullText
                                label="Response"
                                text={selectedInteraction.responseText}
                                onCopy={copyToClipboard}
                            />
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function InteractionFullText({
    label,
    onCopy,
    text,
}: {
    label: string;
    onCopy: (label: string, text: string) => Promise<void>;
    text: string;
}) {
    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{label}</h3>
                <button
                    type="button"
                    onClick={() => void onCopy(label, text)}
                    className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.secondaryActionSmall}`}
                >
                    <FontAwesomeIcon aria-hidden icon={faCopy} />
                    Copy
                </button>
            </div>
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-3 text-xs text-[var(--color-ink)]">
                {text}
            </pre>
        </div>
    );
}
