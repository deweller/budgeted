"use client";

import { useEffect, useState } from "react";

import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { controlClassNames } from "@/lib/theme/theme-recipes";

type RecoverableLedger = {
    ledgerId: string;
    name: string;
};

type LedgerLoadRecoveryProps = {
    activeLedgerId: string;
    onSwitched: () => Promise<void>;
};

export function LedgerLoadRecovery({
    activeLedgerId,
    onSwitched,
}: LedgerLoadRecoveryProps) {
    const [ledgers, setLedgers] = useState<RecoverableLedger[]>([]);
    const [selectedLedgerId, setSelectedLedgerId] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSwitching, setIsSwitching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isCurrent = true;

        void (async () => {
            try {
                const response = await fetch("/api/ledgers");

                if (!response.ok) {
                    throw new Error(
                        await parseApiErrorMessage(
                            response,
                            "Unable to load available ledgers.",
                        ),
                    );
                }

                const payload = (await response.json()) as {
                    ledgers: RecoverableLedger[];
                };
                const alternatives = payload.ledgers.filter(
                    (ledger) => ledger.ledgerId !== activeLedgerId,
                );

                if (!isCurrent) {
                    return;
                }

                setLedgers(alternatives);
                setSelectedLedgerId(alternatives[0]?.ledgerId ?? "");
            } catch (loadError) {
                if (isCurrent) {
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : "Unable to load available ledgers.",
                    );
                }
            } finally {
                if (isCurrent) {
                    setIsLoading(false);
                }
            }
        })();

        return () => {
            isCurrent = false;
        };
    }, [activeLedgerId]);

    async function switchLedger() {
        if (!selectedLedgerId) {
            return;
        }

        setIsSwitching(true);
        setError(null);

        try {
            const response = await fetch(`/api/ledgers/${selectedLedgerId}`, {
                method: "PATCH",
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to switch ledgers.",
                    ),
                );
            }

            await onSwitched();
        } catch (switchError) {
            setError(
                switchError instanceof Error
                    ? switchError.message
                    : "Unable to switch ledgers.",
            );
        } finally {
            setIsSwitching(false);
        }
    }

    if (isLoading || ledgers.length === 0) {
        return null;
    }

    return (
        <div className="grid w-full max-w-md gap-2 border-t border-[var(--color-border)] pt-4 text-left">
            <p className="text-sm font-medium text-[var(--color-ink)]">
                Switch to another ledger
            </p>
            <p className="text-sm leading-6 text-[var(--color-muted)]">
                You can switch to a ledger with valid workspace data and return
                to this one after it has been repaired.
            </p>
            <div className="flex flex-wrap gap-2">
                <select
                    aria-label="Available ledgers"
                    className="min-w-0 flex-1 border border-[var(--color-border-strong)] bg-[var(--color-panel)] px-3 py-1.5 text-sm text-[var(--color-ink)]"
                    disabled={isSwitching}
                    onChange={(event) =>
                        setSelectedLedgerId(event.target.value)
                    }
                    value={selectedLedgerId}
                >
                    {ledgers.map((ledger) => (
                        <option key={ledger.ledgerId} value={ledger.ledgerId}>
                            {ledger.name}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    className={controlClassNames.primaryActionCompact}
                    disabled={isSwitching}
                    onClick={() => void switchLedger()}
                >
                    {isSwitching ? "Switching…" : "Switch ledger"}
                </button>
            </div>
            {error ? (
                <p className="text-sm text-[var(--color-danger-ink)]" role="alert">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
