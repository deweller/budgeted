import { NextResponse } from "next/server";

import {
    WORKSPACE_KNOWLEDGE_HEADER,
    type WorkspaceKnowledge,
} from "@/lib/workspace/sync-types";

function encodeWorkspaceKnowledge(knowledge: WorkspaceKnowledge) {
    return Buffer.from(JSON.stringify(knowledge), "utf8").toString("base64url");
}

export function withWorkspaceKnowledgeHeader<T extends Response>(
    response: T,
    knowledge: WorkspaceKnowledge,
) {
    response.headers.set(
        WORKSPACE_KNOWLEDGE_HEADER,
        encodeWorkspaceKnowledge(knowledge),
    );

    return response;
}

export function workspaceJsonResponse<T>(
    body: T,
    init: ResponseInit | undefined,
    knowledge: WorkspaceKnowledge,
) {
    return withWorkspaceKnowledgeHeader(
        NextResponse.json(body, init),
        knowledge,
    );
}
