export type WorkspaceLandingPath = "/dashboard";

export async function resolveWorkspaceLanding(
    userId: string,
): Promise<WorkspaceLandingPath> {
    void userId;
    return "/dashboard";
}
