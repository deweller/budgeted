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

export type BackgroundMutationActivityInput = {
    completedLabel: string;
    pendingLabel: string;
};

export const BACKGROUND_MUTATION_ACTIVITY_COMPLETED_EVENT =
    "budgeted:background-mutation-completed";

export type BackgroundMutationActivity = {
    completedLabel: string;
    id: string;
    pendingLabel: string;
    status: "completed" | "pending";
};

type BackgroundMutationActivityHandle = {
    complete: () => void;
    fail: () => void;
};

type BackgroundMutationActivityContextValue = {
    activities: BackgroundMutationActivity[];
    runActivity: <T>(
        input: BackgroundMutationActivityInput,
        operation: () => Promise<T>,
    ) => Promise<T>;
    startActivity: (
        input: BackgroundMutationActivityInput,
    ) => BackgroundMutationActivityHandle;
};

const completedActivityDurationMs = 5_000;
const BackgroundMutationActivityContext =
    createContext<BackgroundMutationActivityContextValue | null>(null);

const fallbackContext: BackgroundMutationActivityContextValue = {
    activities: [],
    runActivity: async (_input, operation) => operation(),
    startActivity: () => ({
        complete: () => undefined,
        fail: () => undefined,
    }),
};

function createActivityId() {
    return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function BackgroundMutationActivityProvider({
    children,
}: {
    children: ReactNode;
}) {
    const [activities, setActivities] = useState<BackgroundMutationActivity[]>(
        [],
    );
    const completedActivityTimeoutsRef = useRef(
        new Map<string, ReturnType<typeof setTimeout>>(),
    );

    const removeActivity = useCallback((id: string) => {
        const timeoutId = completedActivityTimeoutsRef.current.get(id);

        if (timeoutId) {
            clearTimeout(timeoutId);
            completedActivityTimeoutsRef.current.delete(id);
        }

        setActivities((currentActivities) =>
            currentActivities.filter((activity) => activity.id !== id),
        );
    }, []);

    const startActivity = useCallback(
        (input: BackgroundMutationActivityInput) => {
            const id = createActivityId();
            let isSettled = false;

            setActivities((currentActivities) => [
                {
                    ...input,
                    id,
                    status: "pending",
                },
                ...currentActivities,
            ]);

            return {
                complete: () => {
                    if (isSettled) {
                        return;
                    }

                    isSettled = true;
                    setActivities((currentActivities) =>
                        currentActivities.map((activity) =>
                            activity.id === id
                                ? { ...activity, status: "completed" }
                                : activity,
                        ),
                    );

                    const timeoutId = setTimeout(() => {
                        removeActivity(id);
                    }, completedActivityDurationMs);

                    completedActivityTimeoutsRef.current.set(id, timeoutId);
                },
                fail: () => {
                    if (isSettled) {
                        return;
                    }

                    isSettled = true;
                    removeActivity(id);
                },
            } satisfies BackgroundMutationActivityHandle;
        },
        [removeActivity],
    );

    const value = useMemo<BackgroundMutationActivityContextValue>(
        () => ({
            activities,
            runActivity: async (input, operation) => {
                const activity = startActivity(input);

                try {
                    const result = await operation();
                    activity.complete();
                    return result;
                } catch (error) {
                    activity.fail();
                    throw error;
                }
            },
            startActivity,
        }),
        [activities, startActivity],
    );

    useEffect(
        () => () => {
            for (const timeoutId of completedActivityTimeoutsRef.current.values()) {
                clearTimeout(timeoutId);
            }
        },
        [],
    );

    useEffect(() => {
        function handleCompletedActivity(event: Event) {
            const completedLabel =
                event instanceof CustomEvent &&
                typeof event.detail?.completedLabel === "string"
                    ? event.detail.completedLabel
                    : null;

            if (!completedLabel) {
                return;
            }

            const activity = startActivity({
                completedLabel,
                pendingLabel: completedLabel,
            });
            activity.complete();
        }

        window.addEventListener(
            BACKGROUND_MUTATION_ACTIVITY_COMPLETED_EVENT,
            handleCompletedActivity,
        );

        return () =>
            window.removeEventListener(
                BACKGROUND_MUTATION_ACTIVITY_COMPLETED_EVENT,
                handleCompletedActivity,
            );
    }, [startActivity]);

    return (
        <BackgroundMutationActivityContext.Provider value={value}>
            {children}
        </BackgroundMutationActivityContext.Provider>
    );
}

export function useBackgroundMutationActivity() {
    return (
        useContext(BackgroundMutationActivityContext) ?? fallbackContext
    );
}
