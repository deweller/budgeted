import {
    parse,
    type ConstantNode,
    type MathNode,
    type OperatorNode,
    type SymbolNode,
} from "mathjs";

export type TransactionTemplateLineDefinition = {
    categoryId: string;
    formula: string;
    lineId: string;
    sortOrder: number;
};

export type ResolvedTransactionTemplateLine = TransactionTemplateLineDefinition & {
    amountCents: number;
};

type FormulaVariables = {
    remainderCents: number;
    totalCents: number;
};

type ResolveTemplateLinesInput = {
    lines: TransactionTemplateLineDefinition[];
    requireNonZero?: boolean;
    totalCents: number;
};

const allowedOperators = new Set(["+", "-", "*", "/"]);
const allowedSymbols = new Set(["remainder", "total"]);

function validateConstantNode(node: ConstantNode) {
    if (typeof node.value !== "number" || !Number.isFinite(node.value)) {
        throw new Error("Formula numbers must be finite.");
    }
}

function validateOperatorNode(node: OperatorNode) {
    if (!allowedOperators.has(node.op) || node.implicit) {
        throw new Error(
            "Formula can only use +, -, *, /, and explicit parentheses.",
        );
    }

    const isUnaryOperator = node.args.length === 1;
    const isBinaryOperator = node.args.length === 2;

    if (!isUnaryOperator && !isBinaryOperator) {
        throw new Error("Formula operator usage is invalid.");
    }
}

function validateSymbolNode(node: SymbolNode) {
    if (!allowedSymbols.has(node.name)) {
        throw new Error("Formula variables must be total or remainder.");
    }
}

function validateFormulaNode(node: MathNode) {
    node.traverse((currentNode) => {
        switch (currentNode.type) {
            case "ConstantNode":
                validateConstantNode(currentNode as ConstantNode);
                return;
            case "OperatorNode":
                validateOperatorNode(currentNode as OperatorNode);
                return;
            case "ParenthesisNode":
                return;
            case "SymbolNode":
                validateSymbolNode(currentNode as SymbolNode);
                return;
            default:
                throw new Error(
                    "Formula can only use numbers, total, remainder, arithmetic operators, and parentheses.",
                );
        }
    });
}

function parseFormula(formula: string) {
    const trimmed = formula.trim();

    if (!trimmed) {
        throw new Error("Formula is required.");
    }

    let node: MathNode;

    try {
        node = parse(trimmed);
    } catch {
        throw new Error("Formula syntax is invalid.");
    }

    validateFormulaNode(node);

    return node;
}

export function evaluateTransactionTemplateFormula(
    formula: string,
    variables: FormulaVariables,
) {
    const node = parseFormula(formula);
    const amountDollars = node.compile().evaluate({
        remainder: variables.remainderCents / 100,
        total: variables.totalCents / 100,
    }) as unknown;

    if (typeof amountDollars !== "number" || !Number.isFinite(amountDollars)) {
        throw new Error("Formula result must be finite.");
    }

    const amountCents = Math.round(amountDollars * 100);

    if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents)) {
        throw new Error("Formula result must resolve to whole cents.");
    }

    return amountCents;
}

export function assertValidTransactionTemplateFormula(formula: string) {
    evaluateTransactionTemplateFormula(formula, {
        remainderCents: 10_000,
        totalCents: 10_000,
    });
}

export function resolveTransactionTemplateLines({
    lines,
    requireNonZero = false,
    totalCents,
}: ResolveTemplateLinesInput) {
    let remainderCents = totalCents;

    return [...lines]
        .sort(
            (left, right) =>
                left.sortOrder - right.sortOrder ||
                left.lineId.localeCompare(right.lineId),
        )
        .map((line): ResolvedTransactionTemplateLine => {
            const amountCents = evaluateTransactionTemplateFormula(
                line.formula,
                {
                    remainderCents,
                    totalCents,
                },
            );

            if (requireNonZero && amountCents === 0) {
                throw new Error("Template split amounts cannot resolve to zero.");
            }

            remainderCents -= amountCents;

            return {
                ...line,
                amountCents,
            };
        });
}

export function getTransactionTemplateRemainderCents(
    lines: ResolvedTransactionTemplateLine[],
    totalCents: number,
) {
    return lines.reduce(
        (remainder, line) => remainder - line.amountCents,
        totalCents,
    );
}
