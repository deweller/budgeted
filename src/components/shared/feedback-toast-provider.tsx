"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCircleCheck,
    faCircleExclamation,
    faTriangleExclamation,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";

import { BACKGROUND_MUTATION_ACTIVITY_COMPLETED_EVENT } from "@/components/shared/background-mutation-activity-provider";

type FeedbackToastTone = "error" | "success" | "warning";

type FeedbackToastAction = {
    label: string;
    onSelect: () => void;
};

type FeedbackToastInput = {
    action?: FeedbackToastAction;
    details?: readonly string[];
    message?: string;
    title: string;
};

type FeedbackToastRecord = FeedbackToastInput & {
    id: string;
    state: "entering" | "exiting" | "visible";
    tone: FeedbackToastTone;
};

type FeedbackToastContextValue = {
    dismissFeedback: (id: string) => void;
    notifyError: (input: FeedbackToastInput) => string;
    notifySuccess: (title: string, message?: string) => string;
    notifySuccessToast: (title: string, message?: string) => string;
    notifyWarning: (input: FeedbackToastInput) => string;
};

const successToastDurationMs = 4_500;
const toastAnimationDurationMs = 220;
const FeedbackToastContext = createContext<FeedbackToastContextValue | null>(
    null,
);

const fallbackFeedbackToastContext: FeedbackToastContextValue = {
    dismissFeedback: () => undefined,
    notifyError: () => "",
    notifySuccess: () => "",
    notifySuccessToast: () => "",
    notifyWarning: () => "",
};

function createToastId() {
    return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function FeedbackToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<FeedbackToastRecord[]>([]);
    const autoDismissTimeoutIdsRef = useRef(
        new Map<string, ReturnType<typeof setTimeout>>(),
    );
    const removalTimeoutIdsRef = useRef(
        new Map<string, ReturnType<typeof setTimeout>>(),
    );
    const showTimeoutIdsRef = useRef(
        new Map<string, ReturnType<typeof setTimeout>>(),
    );

    const removeFeedback = useCallback((id: string) => {
        const autoDismissTimeoutId = autoDismissTimeoutIdsRef.current.get(id);
        const removalTimeoutId = removalTimeoutIdsRef.current.get(id);
        const showTimeoutId = showTimeoutIdsRef.current.get(id);

        if (autoDismissTimeoutId) {
            clearTimeout(autoDismissTimeoutId);
            autoDismissTimeoutIdsRef.current.delete(id);
        }

        if (removalTimeoutId) {
            clearTimeout(removalTimeoutId);
            removalTimeoutIdsRef.current.delete(id);
        }

        if (showTimeoutId) {
            clearTimeout(showTimeoutId);
            showTimeoutIdsRef.current.delete(id);
        }

        setToasts((currentToasts) =>
            currentToasts.filter((toast) => toast.id !== id),
        );
    }, []);

    const dismissFeedback = useCallback(
        (id: string) => {
            const autoDismissTimeoutId =
                autoDismissTimeoutIdsRef.current.get(id);
            const showTimeoutId = showTimeoutIdsRef.current.get(id);

            if (autoDismissTimeoutId) {
                clearTimeout(autoDismissTimeoutId);
                autoDismissTimeoutIdsRef.current.delete(id);
            }

            if (showTimeoutId) {
                clearTimeout(showTimeoutId);
                showTimeoutIdsRef.current.delete(id);
            }

            setToasts((currentToasts) =>
                currentToasts.map((toast) =>
                    toast.id === id ? { ...toast, state: "exiting" } : toast,
                ),
            );

            if (!removalTimeoutIdsRef.current.has(id)) {
                const removalTimeoutId = setTimeout(() => {
                    removeFeedback(id);
                }, toastAnimationDurationMs);

                removalTimeoutIdsRef.current.set(id, removalTimeoutId);
            }
        },
        [removeFeedback],
    );

    const addFeedback = useCallback(
        (tone: FeedbackToastTone, input: FeedbackToastInput) => {
            const id = createToastId();

            setToasts((currentToasts) => [
                ...currentToasts,
                {
                    ...input,
                    id,
                    state: "entering",
                    tone,
                },
            ]);

            const showTimeoutId = setTimeout(() => {
                showTimeoutIdsRef.current.delete(id);
                setToasts((currentToasts) =>
                    currentToasts.map((toast) =>
                        toast.id === id && toast.state === "entering"
                            ? { ...toast, state: "visible" }
                            : toast,
                    ),
                );
            }, 20);

            showTimeoutIdsRef.current.set(id, showTimeoutId);

            if (tone === "success") {
                const timeoutId = setTimeout(() => {
                    dismissFeedback(id);
                }, successToastDurationMs);

                autoDismissTimeoutIdsRef.current.set(id, timeoutId);
            }

            return id;
        },
        [dismissFeedback],
    );

    const value = useMemo<FeedbackToastContextValue>(
        () => ({
            dismissFeedback,
            notifyError: (input) => addFeedback("error", input),
            notifySuccess: (title) => {
                window.dispatchEvent(
                    new CustomEvent(
                        BACKGROUND_MUTATION_ACTIVITY_COMPLETED_EVENT,
                        { detail: { completedLabel: title } },
                    ),
                );

                return "";
            },
            notifySuccessToast: (title, message) =>
                addFeedback("success", { message, title }),
            notifyWarning: (input) => addFeedback("warning", input),
        }),
        [addFeedback, dismissFeedback],
    );

    useEffect(
        () => () => {
            for (const timeoutId of autoDismissTimeoutIdsRef.current.values()) {
                clearTimeout(timeoutId);
            }

            for (const timeoutId of removalTimeoutIdsRef.current.values()) {
                clearTimeout(timeoutId);
            }

            for (const timeoutId of showTimeoutIdsRef.current.values()) {
                clearTimeout(timeoutId);
            }
        },
        [],
    );

    return (
        <FeedbackToastContext.Provider value={value}>
            {children}
            <FeedbackToastViewport
                dismissFeedback={dismissFeedback}
                toasts={toasts}
            />
        </FeedbackToastContext.Provider>
    );
}

export function useFeedbackToasts() {
    return useContext(FeedbackToastContext) ?? fallbackFeedbackToastContext;
}

function FeedbackToastViewport({
    dismissFeedback,
    toasts,
}: {
    dismissFeedback: (id: string) => void;
    toasts: FeedbackToastRecord[];
}) {
    if (toasts.length === 0) {
        return null;
    }

    return (
        <ol
            aria-label="Notifications"
            className="fixed right-0 top-4 z-[80] grid w-[min(24rem,100vw)] gap-3"
            role="region"
        >
            {toasts.map((toast) => (
                <FeedbackToast
                    key={toast.id}
                    dismissFeedback={dismissFeedback}
                    toast={toast}
                />
            ))}
        </ol>
    );
}

function FeedbackToast({
    dismissFeedback,
    toast,
}: {
    dismissFeedback: (id: string) => void;
    toast: FeedbackToastRecord;
}) {
    const tone = getFeedbackToastToneConfig(toast.tone);
    const animationClassName =
        toast.state === "exiting"
            ? "feedback-toast-exit"
            : "feedback-toast-enter";

    return (
        <li
            role={tone.role}
            className={`grid transform-gpu gap-3 p-4 shadow-[var(--shadow-panel)] ${animationClassName} ${tone.className}`}
        >
            <div className="flex items-start gap-3">
                <FontAwesomeIcon
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    icon={tone.icon}
                />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-5 text-current">
                        {toast.title}
                    </div>
                    {toast.message ? (
                        <div className="mt-1 text-sm leading-6 text-current/90">
                            {toast.message}
                        </div>
                    ) : null}
                    {toast.details && toast.details.length > 0 ? (
                        <div className="mt-3 grid gap-1 border-t border-white/20 pt-2 text-xs leading-5 text-current/75">
                            {toast.details.map((detail) => (
                                <p key={detail}>{detail}</p>
                            ))}
                        </div>
                    ) : null}
                </div>
                <button
                    type="button"
                    aria-label={`Dismiss ${toast.title}`}
                    onClick={() => dismissFeedback(toast.id)}
                    className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center bg-transparent text-xs leading-none text-current transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/45"
                >
                    <FontAwesomeIcon aria-hidden="true" icon={faXmark} />
                </button>
            </div>

            {toast.action ? (
                <button
                    type="button"
                    onClick={() => {
                        dismissFeedback(toast.id);
                        toast.action?.onSelect();
                    }}
                    className="w-fit bg-white/10 px-2 py-1 text-xs font-medium text-current transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/45"
                >
                    {toast.action.label}
                </button>
            ) : null}
        </li>
    );
}

function getFeedbackToastToneConfig(tone: FeedbackToastTone) {
    if (tone === "success") {
        return {
            className:
                "bg-[var(--tone-success-surface-strong)] text-[var(--tone-success-ink)]",
            icon: faCircleCheck,
            role: "status" as const,
        };
    }

    if (tone === "warning") {
        return {
            className:
                "bg-[var(--tone-warning-surface-strong)] text-[var(--tone-warning-ink)]",
            icon: faTriangleExclamation,
            role: "status" as const,
        };
    }

    return {
        className:
            "bg-[var(--tone-error-surface-strong)] text-[var(--tone-error-ink)]",
        icon: faCircleExclamation,
        role: "alert" as const,
    };
}
