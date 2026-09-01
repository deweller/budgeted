import { performance } from "node:perf_hooks";

export type PerfResult = {
    averageMs: number;
    iterations: number;
    p95Ms: number;
};

export async function measureAsyncP95(
    run: () => Promise<unknown>,
    options?: {
        iterations?: number;
        warmup?: number;
    },
): Promise<PerfResult> {
    const iterations = options?.iterations ?? 30;
    const warmup = options?.warmup ?? 5;

    for (let index = 0; index < warmup; index += 1) {
        await run();
    }

    const samplesMs: number[] = [];

    for (let index = 0; index < iterations; index += 1) {
        const startedAt = performance.now();
        await run();
        samplesMs.push(performance.now() - startedAt);
    }

    const sortedSamples = [...samplesMs].sort((left, right) => left - right);
    const p95Index = Math.min(
        sortedSamples.length - 1,
        Math.ceil(sortedSamples.length * 0.95) - 1,
    );
    const totalMs = samplesMs.reduce((sum, sample) => sum + sample, 0);

    return {
        iterations,
        averageMs: Number((totalMs / samplesMs.length).toFixed(2)),
        p95Ms: Number(sortedSamples[p95Index].toFixed(2)),
    };
}

export function formatPerfResult(label: string, result: PerfResult) {
    return `${label}: p95=${result.p95Ms}ms avg=${result.averageMs}ms runs=${result.iterations}`;
}
