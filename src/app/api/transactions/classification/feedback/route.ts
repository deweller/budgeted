import { NextResponse } from "next/server";

export async function POST() {
    return NextResponse.json(
        {
            error: {
                code: "classification_feedback_removed",
                message: "Saving AI classification feedback is no longer supported.",
            },
        },
        { status: 410 },
    );
}
