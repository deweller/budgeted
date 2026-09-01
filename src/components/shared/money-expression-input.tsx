"use client";

import {
    faCalculator,
    faMinus,
    faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    forwardRef,
    useRef,
    useState,
    type ChangeEvent,
    type FocusEvent,
    type InputHTMLAttributes,
    type Ref,
} from "react";
import { createPortal } from "react-dom";

import {
    formatUsd,
    tryParseUsdToCents,
} from "@/lib/formatting/money";
import { getMoneyToneClassName } from "@/lib/theme/theme-recipes";

type MoneyExpressionInputProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type"
> & {
    emptySignPreference?: MoneyExpressionSign;
    previewClassName?: string;
    signPreferenceKey?: string;
    wrapperClassName?: string;
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
    if (!ref) {
        return;
    }

    if (typeof ref === "function") {
        ref(value);
        return;
    }

    ref.current = value;
}

function toInputString(value: InputHTMLAttributes<HTMLInputElement>["value"]) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value);
}

export type MoneyExpressionSign = "negative" | "positive";
type MoneyExpressionVisualSign = MoneyExpressionSign | "empty";

function getMoneyExpressionSignPreference(value: string): MoneyExpressionSign {
    return /^\s*-/.test(value) ? "negative" : "positive";
}

function getExplicitMoneyExpressionSign(value: string) {
    if (/^\s*-/.test(value)) {
        return "negative" satisfies MoneyExpressionSign;
    }

    if (/^\s*\+/.test(value)) {
        return "positive" satisfies MoneyExpressionSign;
    }

    return undefined;
}

function removeLeadingMoneyExpressionSign(value: string) {
    return value.replace(/^(\s*)[+-]\s*/, "$1");
}

function applyMoneyExpressionSign(input: {
    preserveExplicitSign?: boolean;
    sign: Exclude<MoneyExpressionSign, "empty">;
    value: string;
}) {
    const unsignedValue = removeLeadingMoneyExpressionSign(input.value);
    const explicitSign = getExplicitMoneyExpressionSign(input.value);

    if (!unsignedValue.trim()) {
        return explicitSign === "negative"
            ? "-"
            : explicitSign === "positive"
              ? "+"
              : "";
    }

    if (input.preserveExplicitSign && explicitSign) {
        return `${explicitSign === "negative" ? "-" : "+"}${unsignedValue}`;
    }

    return input.sign === "negative" ? `-${unsignedValue}` : unsignedValue;
}

function setInputValue(input: HTMLInputElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
    )?.set;

    valueSetter?.call(input, value);
}

function MoneyExpressionPreviewBar({
    expressionText,
    previewClassName,
    resultText,
    resultToneClassName,
}: {
    expressionText: string;
    previewClassName: string;
    resultText: string;
    resultToneClassName: string;
}) {
    if (typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div
            aria-label="Value preview"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-50"
            role="status"
        >
            <div className="selection-action-bar-enter flex w-full items-center justify-center border-t border-[var(--color-action-bar-border)] bg-[var(--color-action-bar)] px-4 py-3 text-[var(--color-action-bar-ink)] shadow-[var(--shadow-action-bar)]">
                <div className="flex min-w-0 items-baseline gap-2 text-lg font-semibold tabular-nums">
                    <FontAwesomeIcon
                        aria-hidden="true"
                        className="shrink-0 self-center text-[var(--color-action-bar-muted)]"
                        icon={faCalculator}
                    />
                    <span className="min-w-0 truncate text-[var(--color-action-bar-ink)]">
                        {expressionText}
                    </span>
                    {" "}
                    <span className="text-[var(--color-action-bar-muted)]">
                        =
                    </span>
                    {" "}
                    <span
                        className={`${resultToneClassName} ${previewClassName}`}
                    >
                        {resultText}
                    </span>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export const MoneyExpressionInput = forwardRef<
    HTMLInputElement,
    MoneyExpressionInputProps
>(function MoneyExpressionInput(
    {
        className = "",
        defaultValue,
        emptySignPreference,
        name,
        onBlur,
        onChange,
        onFocus,
        previewClassName = "",
        signPreferenceKey,
        value,
        wrapperClassName = "",
        ...props
    },
    ref,
) {
    const [isFocused, setIsFocused] = useState(false);
    const [localValue, setLocalValue] = useState(toInputString(defaultValue));
    const [isExplicitSignVisible, setIsExplicitSignVisible] =
        useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const storedValue =
        value === undefined ? localValue : toInputString(value);
    const isEmpty = !storedValue.trim();
    const storedSignPreference = getMoneyExpressionSignPreference(storedValue);
    const defaultSignPreference =
        emptySignPreference ?? storedSignPreference;
    const [emptySignPreferenceState, setEmptySignPreferenceState] =
        useState(() => ({
            hasUserPreference: false,
            key: signPreferenceKey,
            preference: defaultSignPreference,
        }));
    const hasCurrentEmptySignPreference =
        emptySignPreferenceState.key === signPreferenceKey &&
        emptySignPreferenceState.hasUserPreference;

    const activeSignPreference = isEmpty
        ? hasCurrentEmptySignPreference
            ? emptySignPreferenceState.preference
            : defaultSignPreference
        : storedSignPreference;
    const visualSign: MoneyExpressionVisualSign = isEmpty
        ? "empty"
        : storedSignPreference;
    const displayValue = isExplicitSignVisible
        ? storedValue
        : removeLeadingMoneyExpressionSign(storedValue);
    const previewCents = tryParseUsdToCents(storedValue);
    const expressionText = storedValue.trim() || "Value";
    const resultText =
        previewCents === null ? "unknown" : formatUsd(previewCents);
    const resultToneClassName =
        previewCents === null
            ? "text-[var(--color-muted)]"
            : getMoneyToneClassName(previewCents);

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        const explicitSign = getExplicitMoneyExpressionSign(event.target.value);
        const nextSignPreference = explicitSign ?? activeSignPreference;
        const nextValue = applyMoneyExpressionSign({
            preserveExplicitSign: Boolean(explicitSign),
            sign: nextSignPreference,
            value: event.target.value,
        });

        if (!nextValue || explicitSign) {
            setEmptySignPreferenceState({
                hasUserPreference: true,
                key: signPreferenceKey,
                preference: nextSignPreference,
            });
        }

        setIsExplicitSignVisible(Boolean(explicitSign));
        setInputValue(event.currentTarget, nextValue);
        setLocalValue(nextValue);
        onChange?.(event);
    }

    function handleFocus(event: FocusEvent<HTMLInputElement>) {
        setIsFocused(true);
        onFocus?.(event);
    }

    function handleBlur(event: FocusEvent<HTMLInputElement>) {
        const explicitSign = getExplicitMoneyExpressionSign(event.target.value);
        const nextValue = applyMoneyExpressionSign({
            preserveExplicitSign: Boolean(explicitSign),
            sign: explicitSign ?? activeSignPreference,
            value: event.target.value,
        });

        setIsExplicitSignVisible(Boolean(explicitSign));
        setInputValue(event.currentTarget, nextValue);
        setIsFocused(false);
        onBlur?.(event);
    }

    function handleSignToggle() {
        const nextSignPreference =
            activeSignPreference === "negative" ? "positive" : "negative";

        setIsExplicitSignVisible(false);
        setEmptySignPreferenceState({
            hasUserPreference: true,
            key: signPreferenceKey,
            preference: nextSignPreference,
        });

        if (isEmpty || !inputRef.current) {
            return;
        }

        const nextValue = applyMoneyExpressionSign({
            sign: nextSignPreference,
            value: displayValue,
        });

        setInputValue(inputRef.current, nextValue);
        setLocalValue(nextValue);
        onChange?.({
            currentTarget: inputRef.current,
            target: inputRef.current,
        } as ChangeEvent<HTMLInputElement>);
    }

    const signButtonLabel =
        visualSign === "negative"
            ? "Negative sign. Switch to positive."
            : visualSign === "positive"
              ? "Positive sign. Switch to negative."
              : `No value entered. Sign preference is ${activeSignPreference}. Switch to ${activeSignPreference === "negative" ? "positive" : "negative"}.`;
    const signButtonText =
        visualSign === "negative" ? "-" : visualSign === "positive" ? "+" : "";
    const signButtonToneClassName =
        visualSign === "negative"
            ? "bg-[var(--tone-error-surface-strong)] money-negative"
            : visualSign === "positive"
              ? "bg-[var(--tone-success-surface-strong)] money-positive"
              : "bg-[var(--tone-money-zero-surface)] money-zero";

    return (
        <>
            <span className={`flex min-w-0 items-stretch ${wrapperClassName}`}>
                {name ? <input name={name} type="hidden" value={storedValue} /> : null}
                <input
                    {...props}
                    ref={(node) => {
                        inputRef.current = node;
                        assignRef(ref, node);
                    }}
                    inputMode={props.inputMode ?? "decimal"}
                    name={undefined}
                    value={displayValue}
                    onBlur={handleBlur}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    className={`order-2 min-w-0 flex-1 ${className}`}
                />
                <button
                    aria-label={signButtonLabel}
                    className={`order-1 flex w-8 shrink-0 items-center justify-center border border-r-0 border-[var(--color-field-border)] text-lg font-semibold outline-none transition hover:brightness-110 focus:border-[var(--color-accent-ink)] focus:ring-2 focus:ring-[var(--color-accent-ring)] disabled:cursor-not-allowed disabled:opacity-60 ${signButtonToneClassName}`}
                    disabled={props.disabled}
                    onClick={handleSignToggle}
                    type="button"
                >
                    {signButtonText ? (
                        <FontAwesomeIcon
                            aria-hidden="true"
                            icon={
                                visualSign === "negative" ? faMinus : faPlus
                            }
                        />
                    ) : null}
                </button>
            </span>
            {isFocused ? (
                <MoneyExpressionPreviewBar
                    expressionText={expressionText}
                    previewClassName={previewClassName}
                    resultText={resultText}
                    resultToneClassName={resultToneClassName}
                />
            ) : null}
        </>
    );
});
