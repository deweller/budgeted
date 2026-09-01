import { z } from "zod";

import { HttpError } from "@/lib/api/errors";

export async function parseJsonBody<TSchema extends z.ZodTypeAny>(
    request: Request,
    schema: TSchema,
) {
    let payload: unknown;

    try {
        payload = await request.json();
    } catch {
        throw new HttpError(
            400,
            "invalid_json",
            "Request body must be valid JSON.",
        );
    }

    const result = schema.safeParse(payload);

    if (!result.success) {
        throw new HttpError(
            422,
            "validation_error",
            "Request body failed validation.",
            {
                formErrors: result.error.flatten().formErrors,
                fieldErrors: result.error.flatten().fieldErrors,
            },
        );
    }

    return result.data as z.infer<TSchema>;
}

export function parseSearchParams<TSchema extends z.ZodTypeAny>(
    url: URL,
    schema: TSchema,
) {
    const values = Object.fromEntries(url.searchParams.entries());
    const result = schema.safeParse(values);

    if (!result.success) {
        throw new HttpError(
            422,
            "validation_error",
            "Query string failed validation.",
            {
                formErrors: result.error.flatten().formErrors,
                fieldErrors: result.error.flatten().fieldErrors,
            },
        );
    }

    return result.data as z.infer<TSchema>;
}
