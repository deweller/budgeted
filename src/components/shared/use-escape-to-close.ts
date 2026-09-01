"use client";

import { useEffect } from "react";

type UseEscapeToCloseInput = {
    enabled: boolean;
    onClose: () => void;
};

export function useEscapeToClose({
    enabled,
    onClose,
}: UseEscapeToCloseInput) {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                onClose();
            }
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [enabled, onClose]);
}
