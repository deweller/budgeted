import type { HttpErrorResponse, HttpErrorShape } from "@/lib/api/errors";

const CLIENT_ERROR_CODE = "client_error";

function isHttpErrorShape(value: unknown): value is HttpErrorShape {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof Reflect.get(value, "code") === "string" &&
        typeof Reflect.get(value, "message") === "string"
    );
}

function isHttpErrorResponse(value: unknown): value is HttpErrorResponse {
    return (
        typeof value === "object" &&
        value !== null &&
        isHttpErrorShape(Reflect.get(value, "error"))
    );
}

export async function parseApiError(
    response: Pick<Response, "json">,
    fallbackMessage: string,
): Promise<HttpErrorShape> {
    const body = await response.json().catch(() => null);

    if (isHttpErrorResponse(body)) {
        return body.error;
    }

    return {
        code: CLIENT_ERROR_CODE,
        message: fallbackMessage,
    };
}

export async function parseApiErrorMessage(
    response: Pick<Response, "json">,
    fallbackMessage: string,
) {
    const error = await parseApiError(response, fallbackMessage);
    return error.message;
}
