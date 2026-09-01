import { z } from "zod";

import { isValidIsoDate } from "@/lib/api/date-validation";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const reportingQuerySchema = z
    .object({
        startDate: z
            .string()
            .regex(isoDatePattern, "Start date must use YYYY-MM-DD.")
            .refine(isValidIsoDate, "Start date must be a valid calendar date."),
        endDate: z
            .string()
            .regex(isoDatePattern, "End date must use YYYY-MM-DD.")
            .refine(isValidIsoDate, "End date must be a valid calendar date."),
        accountId: z.preprocess((value) => {
            if (typeof value !== "string") {
                return value;
            }

            const trimmed = value.trim();
            return trimmed ? trimmed : undefined;
        }, z.string().optional()),
    })
    .refine(
        ({ startDate, endDate }) =>
            new Date(`${startDate}T00:00:00.000Z`) <=
            new Date(`${endDate}T23:59:59.999Z`),
        {
            message: "Start date must be on or before the end date.",
            path: ["endDate"],
        },
    );

export type ReportingQuery = z.infer<typeof reportingQuerySchema>;
