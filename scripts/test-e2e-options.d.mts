export const DEFAULT_E2E_STAGE: "e2e";

export type PartitionedE2EArgs = {
    playwrightArgs: string[];
    sstArgs: string[];
    sstDevArgs: string[];
    sstStage: string;
};

export function partitionE2EArgs(
    args: string[],
    options?: {
        defaultStage?: string;
    },
): PartitionedE2EArgs;
