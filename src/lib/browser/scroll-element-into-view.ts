type ScrollElementIntoViewOptions = {
    behavior?: ScrollBehavior;
    block?: ScrollLogicalPosition;
    inline?: ScrollLogicalPosition;
};

export function scrollElementIntoView(
    element: Element | null,
    options: ScrollElementIntoViewOptions = {},
) {
    if (!element || typeof element.scrollIntoView !== "function") {
        return;
    }

    element.scrollIntoView({
        behavior: options.behavior ?? "smooth",
        block: options.block ?? "center",
        inline: options.inline ?? "nearest",
    });
}
