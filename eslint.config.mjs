import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    {
        files: [
            "src/app/api/accounts/**/route.ts",
            "src/app/api/budget/categories/route.ts",
            "src/app/api/budget/groups/route.ts",
            "src/app/api/budget/periods/**/route.ts",
            "src/app/api/budget/plan/route.ts",
            "src/app/api/extras/amazon-orders/**/route.ts",
            "src/app/api/plaid/**/route.ts",
            "src/app/api/transactions/**/route.ts",
            "src/app/api/utilities/auto-assign-sources/route.ts",
            "src/app/api/utilities/transaction-templates/**/route.ts",
        ],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    paths: [
                        {
                            name: "@/lib/api/workspace-route",
                            importNames: [
                                "workspaceMutationJson",
                                "workspaceMutationNoContent",
                                "workspaceTrackedMutationJson",
                                "workspaceTrackedMutationNoContent",
                            ],
                            message:
                                "Bounded workspace routes must return committed or published workspace changes.",
                        },
                    ],
                },
            ],
        },
    },
    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        ".next/**",
        ".open-next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
        "sst-env.d.ts",
        ".sst/**",
        "coverage/**",
        "playwright-report/**",
        "test-results/**",
    ]),
]);

export default eslintConfig;
