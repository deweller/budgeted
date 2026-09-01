"use client";

import {
    type ChangeEvent,
    type FocusEvent,
    type InputHTMLAttributes,
    type KeyboardEvent,
    type ReactNode,
    useRef,
    useState,
} from "react";

import { controlClassNames } from "@/lib/theme/theme-recipes";

import { MoneyExpressionInput } from "./money-expression-input";

type InlineEditableFieldProps = {
    ariaLabel: string;
    commitOnBlur?: boolean;
    disabled?: boolean;
    displayClassName?: string;
    displayValue?: ReactNode;
    inputAriaLabel?: string;
    inputClassName?: string;
    inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
    isEditing?: boolean;
    name?: string;
    onCancel?: () => void;
    onChange: (value: string) => void;
    onCommit?: (value: string) => void;
    onEditStart?: () => void;
    onEditingChange?: (isEditing: boolean) => void;
    required?: boolean;
    value: string;
    valueKind?: "money" | "text";
};

export function InlineEditableField({
    ariaLabel,
    commitOnBlur = false,
    disabled = false,
    displayClassName = "",
    displayValue,
    inputAriaLabel,
    inputClassName = "",
    inputMode,
    isEditing,
    name,
    onCancel,
    onChange,
    onCommit,
    onEditStart,
    onEditingChange,
    required = false,
    value,
    valueKind = "text",
}: InlineEditableFieldProps) {
    const [localIsEditing, setLocalIsEditing] = useState(false);
    const skipNextBlurCommitRef = useRef(false);
    const resolvedIsEditing = isEditing ?? localIsEditing;

    function setEditing(nextIsEditing: boolean) {
        if (isEditing === undefined) {
            setLocalIsEditing(nextIsEditing);
        }

        onEditingChange?.(nextIsEditing);
    }

    function startEditing() {
        if (disabled) {
            return;
        }

        onEditStart?.();
        setEditing(true);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Enter") {
            if (!onCommit) {
                return;
            }

            event.preventDefault();
            skipNextBlurCommitRef.current = true;
            onCommit(event.currentTarget.value);
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            skipNextBlurCommitRef.current = true;
            onCancel?.();
            setEditing(false);
        }
    }

    if (resolvedIsEditing && !disabled) {
        const sharedInputProps = {
            "aria-label": inputAriaLabel ?? ariaLabel,
            autoFocus: true,
            inputMode,
            name,
            required,
            value,
            onChange: (event: ChangeEvent<HTMLInputElement>) => {
                onChange(event.target.value);
            },
            onFocus: (event: FocusEvent<HTMLInputElement>) => {
                event.currentTarget.select();
            },
            onBlur: (event: FocusEvent<HTMLInputElement>) => {
                if (!commitOnBlur || !onCommit) {
                    return;
                }

                if (skipNextBlurCommitRef.current) {
                    skipNextBlurCommitRef.current = false;
                    return;
                }

                onCommit(event.currentTarget.value);
            },
            onKeyDown: handleKeyDown,
            className: `${controlClassNames.fieldCompact} ${inputClassName}`,
        };

        return valueKind === "money" ? (
            <MoneyExpressionInput {...sharedInputProps} />
        ) : (
            <input {...sharedInputProps} />
        );
    }

    return (
        <button
            type="button"
            aria-label={ariaLabel}
            onClick={startEditing}
            disabled={disabled}
            className={`inline-flex items-center px-3 py-0 text-sm leading-5 outline outline-1 outline-transparent transition hover:outline-[var(--color-border-strong)] focus-visible:outline-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-60 ${displayClassName}`}
        >
            {displayValue ?? value}
        </button>
    );
}
