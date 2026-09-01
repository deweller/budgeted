import { z } from "zod";

export const automationTaskTypeSchema = z.enum([
    "plaidSync",
    "amazonScraper",
    "amazonImport",
    "aiClassification",
]);

export const automationTaskRunStatusSchema = z.enum([
    "failed",
    "partial",
    "queued",
    "running",
    "skipped",
    "succeeded",
]);

export const automationRunNowInputSchema = z
    .object({
        taskType: automationTaskTypeSchema,
    })
    .strict();

const utcTwoMinuteTimeSchema = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a UTC time.")
    .refine(
        (value) => Number(value.slice(-2)) % 2 === 0,
        "Choose a 2-minute interval.",
    );

export const automationScheduleInputSchema = z
    .object({
        aiClassificationEnabled: z.boolean(),
        aiClassificationTime: utcTwoMinuteTimeSchema,
        amazonImportEnabled: z.boolean(),
        amazonImportTime: utcTwoMinuteTimeSchema,
        amazonScraperEnabled: z.boolean(),
        amazonScraperTime: utcTwoMinuteTimeSchema,
        plaidSyncEnabled: z.boolean(),
        plaidSyncTime: utcTwoMinuteTimeSchema,
    })
    .strict()
    .superRefine((value, context) => {
        const configuredTasks = [
            [value.plaidSyncEnabled, value.plaidSyncTime, "plaidSyncTime"],
            [
                value.amazonScraperEnabled,
                value.amazonScraperTime,
                "amazonScraperTime",
            ],
            [
                value.amazonImportEnabled,
                value.amazonImportTime,
                "amazonImportTime",
            ],
            [
                value.aiClassificationEnabled,
                value.aiClassificationTime,
                "aiClassificationTime",
            ],
        ] as const;
        let previousTime: string | null = null;

        for (const [enabled, time, field] of configuredTasks) {
            if (!enabled) {
                continue;
            }

            if (previousTime && time <= previousTime) {
                context.addIssue({
                    code: "custom",
                    message: "Enabled tasks must be scheduled in this order.",
                    path: [field],
                });
            }

            previousTime = time;
        }
    });

export type AutomationScheduleInput = z.infer<
    typeof automationScheduleInputSchema
>;
export type AutomationTaskType = z.infer<typeof automationTaskTypeSchema>;
export type AutomationTaskRunStatus = z.infer<
    typeof automationTaskRunStatusSchema
>;
export type AutomationRunNowInput = z.infer<typeof automationRunNowInputSchema>;
