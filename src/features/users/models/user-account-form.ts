import { z } from "zod";

export const userAccountRoleSchema = z.enum(["normal", "super"]);

export const userAccountCreateSchema = z.object({
    displayName: z.string().trim().min(1, "Display name is required."),
    email: z.string().trim().email("Email must be valid."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    role: userAccountRoleSchema.default("normal"),
});

export const userAccountUpdateSchema = z.object({
    displayName: z.string().trim().min(1, "Display name is required."),
    email: z.string().trim().email("Email must be valid."),
    role: userAccountRoleSchema,
});

export const userAccountPasswordSchema = z.object({
    password: z.string().min(8, "Password must be at least 8 characters."),
});

export type UserAccountCreateInput = z.infer<typeof userAccountCreateSchema>;
export type UserAccountUpdateInput = z.infer<typeof userAccountUpdateSchema>;
export type UserAccountPasswordInput = z.infer<
    typeof userAccountPasswordSchema
>;
export type UserAccountRole = z.infer<typeof userAccountRoleSchema>;
