"use client";

import {
    Fragment,
    useId,
    useMemo,
    useState,
    type KeyboardEventHandler,
    type Ref,
} from "react";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    useCombobox,
    type UseComboboxState,
    type UseComboboxStateChangeOptions,
} from "downshift";

import { controlClassNames } from "@/lib/theme/theme-recipes";

export type ComboboxSelectOption = {
    description?: string;
    descriptionClassName?: string;
    disabled?: boolean;
    group?: string;
    label: string;
    value: string;
};

type ComboboxOptionVariant = "default" | "category";

type ComboboxSelectProps = {
    className?: string;
    disabled?: boolean;
    emptyOption?: ComboboxSelectOption;
    hideLabel?: boolean;
    inputClassName?: string;
    inputRef?: Ref<HTMLInputElement>;
    label: string;
    labelClassName?: string;
    menuClassName?: string;
    name?: string;
    noResultsLabel?: string;
    onChange: (value: string) => void;
    onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
    optionVariant?: ComboboxOptionVariant;
    options: ComboboxSelectOption[];
    placeholder?: string;
    required?: boolean;
    value: string;
};

const optionClassNameByVariant: Record<
    ComboboxOptionVariant,
    { highlighted: string; idle: string }
> = {
    category: {
        highlighted:
            "border-[#9db7ff] bg-[var(--color-panel-elevated)] normal-case tracking-normal",
        idle: "border-[var(--color-border)]/70 bg-[var(--color-panel-strong)] normal-case tracking-normal",
    },
    default: {
        highlighted: "border-[#9db7ff] bg-[#061126]",
        idle: "border-[var(--color-border)]/70 bg-[var(--color-panel-strong)]",
    },
};

function optionToString(option: ComboboxSelectOption | null) {
    return option?.label ?? "";
}

function filterOptions(
    options: ComboboxSelectOption[],
    inputValue: string,
) {
    const normalizedInput = inputValue.trim().toLowerCase();

    if (!normalizedInput) {
        return options;
    }

    return options.filter((option) => {
        const searchableText = `${option.label} ${option.description ?? ""} ${
            option.group ?? ""
        }`.toLowerCase();

        return searchableText.includes(normalizedInput);
    });
}

function shouldRenderGroupHeader(
    options: ComboboxSelectOption[],
    index: number,
) {
    const group = options[index]?.group;

    return Boolean(group) && group !== options[index - 1]?.group;
}

function getSelectedOptionIndex(
    options: ComboboxSelectOption[],
    selectedOption: ComboboxSelectOption | null,
) {
    if (!selectedOption || selectedOption.disabled) {
        return -1;
    }

    return options.findIndex((option) => option.value === selectedOption.value);
}

export function ComboboxSelect({
    className = "",
    disabled = false,
    emptyOption,
    hideLabel = false,
    inputClassName = "",
    inputRef,
    label,
    labelClassName = "grid gap-2 text-sm font-medium text-[var(--color-ink)]",
    menuClassName = "",
    name,
    noResultsLabel = "No matches",
    onChange,
    onKeyDown,
    options,
    optionVariant = "default",
    placeholder,
    required = false,
    value,
}: ComboboxSelectProps) {
    const generatedId = useId();
    const allOptions = useMemo(
        () => (emptyOption ? [emptyOption, ...options] : options),
        [emptyOption, options],
    );
    const selectedOption =
        allOptions.find((option) => option.value === value) ?? null;
    const selectedLabel = optionToString(selectedOption);
    const [inputValue, setInputValue] = useState(selectedLabel);
    const [filterQuery, setFilterQuery] = useState("");
    const [isFiltering, setIsFiltering] = useState(false);
    const [previousSelectedLabel, setPreviousSelectedLabel] =
        useState(selectedLabel);
    const filteredOptions = useMemo(
        () => filterOptions(allOptions, isFiltering ? filterQuery : ""),
        [allOptions, filterQuery, isFiltering],
    );
    const selectedOptionIndex = getSelectedOptionIndex(
        filteredOptions,
        selectedOption,
    );
    const defaultHighlightedIndex =
        selectedOptionIndex >= 0 ? selectedOptionIndex : 0;
    const stateChangeTypes = useCombobox.stateChangeTypes;

    if (previousSelectedLabel !== selectedLabel) {
        setPreviousSelectedLabel(selectedLabel);
        setInputValue(selectedLabel);
        setFilterQuery("");
        setIsFiltering(false);
    }

    function showAllOptions() {
        setFilterQuery("");
        setIsFiltering(false);
    }

    function restoreSelectedInput() {
        setInputValue(selectedLabel);
        showAllOptions();
    }

    const {
        getInputProps,
        getItemProps,
        getLabelProps,
        getMenuProps,
        getToggleButtonProps,
        highlightedIndex,
        isOpen,
        openMenu,
    } = useCombobox<ComboboxSelectOption>({
        defaultHighlightedIndex,
        id: generatedId,
        inputValue,
        isItemDisabled: (item) => Boolean(item.disabled),
        itemToKey: (item) => item?.value ?? "",
        itemToString: optionToString,
        items: filteredOptions,
        onInputValueChange: ({ inputValue: nextInputValue, type }) => {
            const nextValue = nextInputValue ?? "";

            setInputValue(nextValue);

            if (type === stateChangeTypes.InputChange) {
                setFilterQuery(nextValue);
                setIsFiltering(true);
            }
        },
        onSelectedItemChange: ({ selectedItem }) => {
            if (selectedItem && !selectedItem.disabled) {
                showAllOptions();
                onChange(selectedItem.value);
            }
        },
        selectedItem: selectedOption,
        stateReducer: (
            state: UseComboboxState<ComboboxSelectOption>,
            actionAndChanges: UseComboboxStateChangeOptions<ComboboxSelectOption>,
        ) => {
            const { changes, type } = actionAndChanges;

            if (
                type === stateChangeTypes.InputBlur ||
                type === stateChangeTypes.InputKeyDownEscape
            ) {
                return {
                    ...changes,
                    highlightedIndex: -1,
                    inputValue: optionToString(state.selectedItem),
                    isOpen: false,
                    selectedItem: state.selectedItem,
                };
            }

            if (type === stateChangeTypes.InputChange) {
                return {
                    ...changes,
                    highlightedIndex: 0,
                    isOpen: true,
                };
            }

            if (type === stateChangeTypes.InputClick) {
                return {
                    ...changes,
                    highlightedIndex: defaultHighlightedIndex,
                    isOpen: true,
                };
            }

            if (
                type === stateChangeTypes.FunctionOpenMenu ||
                (type === stateChangeTypes.ToggleButtonClick && changes.isOpen) ||
                (type === stateChangeTypes.FunctionToggleMenu && changes.isOpen)
            ) {
                return {
                    ...changes,
                    highlightedIndex: defaultHighlightedIndex,
                };
            }

            return changes;
        },
    });

    return (
        <div className={`${labelClassName} w-full min-w-0 ${className}`}>
            <label {...getLabelProps()} className={hideLabel ? "sr-only" : ""}>
                {label}
            </label>
            <div className="relative">
                <input
                    {...getInputProps({
                        disabled,
                        onBlur: restoreSelectedInput,
                        onClick: (event) => {
                            event.currentTarget.select();
                            showAllOptions();
                            openMenu();
                        },
                        onFocus: (event) => {
                            event.currentTarget.select();
                            showAllOptions();
                            openMenu();
                        },
                        onKeyDown: (event) => {
                            onKeyDown?.(event);

                            if (event.defaultPrevented) {
                                return;
                            }

                            if (event.key === "Enter" && isOpen) {
                                event.stopPropagation();
                            }
                        },
                        placeholder,
                        ref: inputRef,
                        required,
                    })}
                    className={`${controlClassNames.field} w-full pr-10 ${inputClassName}`}
                />
                <button
                    {...getToggleButtonProps({
                        disabled,
                        onClick: showAllOptions,
                    })}
                    aria-label={`Toggle ${label} choices`}
                    className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-[var(--color-muted)] transition hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                    tabIndex={-1}
                    type="button"
                >
                    <FontAwesomeIcon aria-hidden="true" icon={faChevronDown} />
                </button>
                <ul
                    {...getMenuProps()}
                    className={`absolute z-[60] mt-1 max-h-60 w-full overflow-auto border border-[var(--color-accent-ink)] bg-[var(--color-popover)] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.95)] ring-1 ring-[var(--color-accent-ring)] ${menuClassName} ${
                        isOpen ? "" : "hidden"
                    }`}
                >
                    {isOpen && filteredOptions.length === 0 ? (
                        <li
                            className="px-3 py-2 text-sm text-[var(--color-muted)]"
                            role="option"
                            aria-disabled="true"
                            aria-selected="false"
                        >
                            {noResultsLabel}
                        </li>
                    ) : null}
                    {isOpen
                        ? filteredOptions.map((option, index) => (
                              <Fragment key={option.value}>
                                  {shouldRenderGroupHeader(
                                      filteredOptions,
                                      index,
                                  ) ? (
                                      <li
                                          className="border-b border-[var(--color-border)]/70 bg-[var(--color-popover)] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]"
                                          role="presentation"
                                      >
                                          {option.group}
                                      </li>
                                  ) : null}
                                  <li
                                      {...getItemProps({
                                          item: option,
                                          index,
                                      })}
                                      className={`cursor-pointer border px-3 py-2 text-sm text-[var(--color-ink)] transition ${
                                          option.disabled
                                              ? "cursor-not-allowed opacity-50"
                                              : ""
                                      } ${
                                          highlightedIndex === index
                                              ? optionClassNameByVariant[
                                                    optionVariant
                                                ].highlighted
                                              : optionClassNameByVariant[
                                                    optionVariant
                                                ].idle
                                      }`}
                                  >
                                      <span className="block truncate">
                                          {option.label}
                                      </span>
                                      {option.description ? (
                                          <span
                                              className={`block truncate text-xs ${option.descriptionClassName ?? "text-[var(--color-muted)]"}`}
                                          >
                                              {option.description}
                                          </span>
                                      ) : null}
                                  </li>
                              </Fragment>
                          ))
                        : null}
                </ul>
                {name ? (
                    <input name={name} type="hidden" value={value} readOnly />
                ) : null}
            </div>
        </div>
    );
}
