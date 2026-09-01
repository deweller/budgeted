"use client";

import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type ChangeEventHandler,
    type KeyboardEventHandler,
    type MutableRefObject,
} from "react";

import { isLongTransactionMemo } from "@/features/transactions/models/transaction-memo-input";

type TransactionMemoTextareaProps = {
    className: (isMultiline: boolean) => string;
    disabled?: boolean;
    name?: string;
    onChange: ChangeEventHandler<HTMLTextAreaElement>;
    onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
    textareaRef?: MutableRefObject<HTMLTextAreaElement | null>;
    value: string;
};

function getOneLineContentHeight(textarea: HTMLTextAreaElement) {
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight);
    const paddingHeight =
        Number.parseFloat(styles.paddingTop) +
        Number.parseFloat(styles.paddingBottom);

    return (Number.isFinite(lineHeight) ? lineHeight : 16) + paddingHeight;
}

export function TransactionMemoTextarea({
    className,
    disabled,
    name,
    onChange,
    onKeyDown,
    textareaRef,
    value,
}: TransactionMemoTextareaProps) {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);
    const [isMultiline, setIsMultiline] = useState(() =>
        isLongTransactionMemo(value),
    );

    const setTextareaRef = useCallback(
        (textarea: HTMLTextAreaElement | null) => {
            internalRef.current = textarea;

            if (textareaRef) {
                textareaRef.current = textarea;
            }
        },
        [textareaRef],
    );

    useLayoutEffect(() => {
        const textarea = internalRef.current;

        if (!textarea) {
            return;
        }

        const textareaElement = textarea;

        function updateMultilineState() {
            const previousHeight = textareaElement.style.height;
            textareaElement.style.height = "0px";
            const contentHeight = textareaElement.scrollHeight;
            textareaElement.style.height = previousHeight;

            setIsMultiline(
                isLongTransactionMemo(value) ||
                    contentHeight > getOneLineContentHeight(textareaElement) + 1,
            );
        }

        updateMultilineState();

        if (typeof ResizeObserver === "undefined") {
            return;
        }

        const resizeObserver = new ResizeObserver(updateMultilineState);
        resizeObserver.observe(textareaElement);

        return () => {
            resizeObserver.disconnect();
        };
    }, [value]);

    return (
        <textarea
            ref={setTextareaRef}
            disabled={disabled}
            name={name}
            rows={isMultiline ? 2 : 1}
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            className={className(isMultiline)}
        />
    );
}
