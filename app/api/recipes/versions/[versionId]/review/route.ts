import { NextRequest, NextResponse } from "next/server";
import { reviewRecipeVersion } from "@/lib/db";
import { hasPersistentRecipeStore } from "@/lib/runtime-status";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function POST(request: NextRequest, context: { params: { versionId: string } }) {
  if (!hasPersistentRecipeStore()) {
    return NextResponse.json({
      error: "PERSISTENT_DB_REQUIRED",
      message: "当前环境是临时数据库，不能稳定执行审批。请切换到持久数据库环境后重试。"
    }, { status: 409 });
  }
  const versionId = Number(context.params.versionId);
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const decisionRaw = String(body.decision || "").toLowerCase();
    const decision = decisionRaw === "approve" ? "approve" : "reject";
    const data = reviewRecipeVersion(versionId, String(body.reviewer || ""), decision, body.review_note);
    return NextResponse.json({ data });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "INVALID_STAGE") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "REVIEW_FAILED" }, { status: 500 });
  }
}
