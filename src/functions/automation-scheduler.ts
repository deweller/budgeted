import {
    runQueuedAutomation,
    runScheduledAutomation,
} from "@/features/automation/server/automation-service";

type AutomationInvocationEvent = {
    mode?: "queued";
};

export async function handler(event: AutomationInvocationEvent = {}) {
    if (event.mode === "queued") {
        await runQueuedAutomation();
        return;
    }

    await runScheduledAutomation();
}
