import {
    parse,
    type ConstantNode,
    type MathNode,
    type OperatorNode,
} from "mathjs";

const usdFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const usdPattern = /^[+-]?\d+(\.\d{1,2})?$/;
const allowedExpressionOperators = new Set(["+", "-", "*", "/"]);

export function formatUsd(cents: number) {
    return usdFormatter.format(cents / 100);
}

function sanitizeUsdExpression(value: string) {
    return value.split("=")[0]?.replace(/[^0-9.+\-*/()]/g, "") ?? "";
}

function validateUsdExpressionNode(node: MathNode) {
    node.traverse((currentNode) => {
        switch (currentNode.type) {
            case "ConstantNode": {
                const constantNode = currentNode as ConstantNode;

                if (
                    typeof constantNode.value !== "number" ||
                    !Number.isFinite(constantNode.value)
                ) {
                    throw new Error("USD expression values must be finite.");
                }

                return;
            }
            case "OperatorNode": {
                const operatorNode = currentNode as OperatorNode;

                if (
                    !allowedExpressionOperators.has(operatorNode.op) ||
                    operatorNode.implicit
                ) {
                    throw new Error(
                        "USD expressions can only use +, -, *, /, and parentheses.",
                    );
                }

                if (
                    operatorNode.args.length !== 1 &&
                    operatorNode.args.length !== 2
                ) {
                    throw new Error("USD expression operator usage is invalid.");
                }

                return;
            }
            case "ParenthesisNode":
                return;
            default:
                throw new Error(
                    "USD expressions can only use numbers and arithmetic operators.",
                );
        }
    });
}

function evaluateUsdExpressionToNumber(value: string) {
    const sanitized = sanitizeUsdExpression(value);

    if (!sanitized) {
        throw new Error("USD expression is empty.");
    }

    const node = parse(sanitized);

    validateUsdExpressionNode(node);

    const result = node.compile().evaluate() as unknown;

    if (typeof result !== "number" || !Number.isFinite(result)) {
        throw new Error("USD expression must resolve to a finite number.");
    }

    return result;
}

export function parseUsdToCents(value: number | string) {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error("USD values must be finite numbers.");
        }

        return Math.round(value * 100);
    }

    const normalized = value.replace(/[$,\s]/g, "");

    if (usdPattern.test(normalized)) {
        return Math.round(Number(normalized) * 100);
    }

    try {
        return Math.round(evaluateUsdExpressionToNumber(value) * 100);
    } catch {
        throw new Error(
            "USD values must use standard dollars and cents precision.",
        );
    }
}

export function tryParseUsdToCents(value: number | string) {
    try {
        return parseUsdToCents(value);
    } catch {
        return null;
    }
}

export function assertWholeCents(value: number) {
    if (!Number.isInteger(value)) {
        throw new Error("Monetary values must be stored as whole cents.");
    }

    return value;
}
