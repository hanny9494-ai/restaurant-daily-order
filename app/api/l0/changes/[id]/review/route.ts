import { NextRequest, NextResponse } from "next/server";
import { reviewL0Draft } from "@/lib/l0-engine";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const reviewer = String(body.reviewer || "");
    const decisionRaw = String(body.decision || "").toLowerCase();
    const decision =
      decisionRaw === "approve" || decisionRaw === "reject" || decisionRaw === "need_evidence"
        ? decisionRaw
        : (body.approved ? "approve" : "reject");
    const reviewNote = typeof body.review_note === "string" ? body.review_note : undefined;
    const updated = reviewL0Draft(id, reviewer, decision, reviewNote);
    return NextResponse.json({ data: updated });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "REVIEWER_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "INVALID_STAGE") {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    return NextResponse.json({ error: "review failed" }, { status: 500 });
  }
}
