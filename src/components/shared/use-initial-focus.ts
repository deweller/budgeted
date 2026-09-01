"use client";

import { useEffect, type RefObject } from "react";

type UseInitialFocusOptions = {
    enabled?: boolean;
    select?: boolean;
};

type SelectableElement = HTMLElement & {
    select?: () => void;
};

export function useInitialFocus<TElement extends HTMLElement>(
    targetRef: RefObject<TElement | null>,
    { enabled = true, select = false }: UseInitialFocusOptions = {},
) {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        const focusTimer = window.setTimeout(() => {
            const target = targetRef.current as SelectableElement | null;

            if (!target || target.hasAttribute("disabled")) {
                return;
            }

            target.focus();

            if (select && typeof target.select === "function") {
                target.select();
            }
        }, 0);

        return () => window.clearTimeout(focusTimer);
    }, [enabled, select, targetRef]);
}
