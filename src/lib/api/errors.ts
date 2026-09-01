import { NextResponse } from "next/server";

export type HttpErrorShape = {
    code: string;
    details?: unknown;
    message: string;
};

export type HttpErrorResponse = {
    error: HttpErrorShape;
};

export const INTERNAL_ERROR_CODE = "internal_error";
export const INTERNAL_ERROR_MESSAGE = "Unexpected server error.";
export const WORKSPACE_MUTATION_IN_PROGRESS_ERROR_CODE =
    "workspace_mutation_in_progress";
export const WORKSPACE_MUTATION_RETRY_AFTER_MS = 500;

export class HttpError extends Error {
    readonly code: string;
    readonly details?: unknown;
    readonly status: number;

    constructor(
        status: number,
        code: string,
        message: string,
        details?: unknown,
    ) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }

    toJSON(): HttpErrorShape {
        return {
            code: this.code,
            details: this.details,
            message: this.message,
        };
    }
}

export function toErrorResponse(error: unknown) {
    if (error instanceof HttpError) {
        const response = NextResponse.json(
            { error: error.toJSON() } satisfies HttpErrorResponse,
            { status: error.status },
        );

        if (error.code === WORKSPACE_MUTATION_IN_PROGRESS_ERROR_CODE) {
            response.headers.set("Retry-After", "1");
        }

        return response;
    }

    console.error(error);

    return NextResponse.json(
        {
            error: {
                code: INTERNAL_ERROR_CODE,
                message: INTERNAL_ERROR_MESSAGE,
            },
        } satisfies HttpErrorResponse,
        { status: 500 },
    );
}
