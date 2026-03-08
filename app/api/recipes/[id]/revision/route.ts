import { NextRequest, NextResponse } from "next/server";
import { createRecipeRevision } from "@/lib/db";
import { hasPersistentRecipeStore } from "@/lib/runtime-status";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  if (!hasPersistentRecipeStore()) {
    return NextResponse.json({
      error: "PERSISTENT_DB_REQUIRED",
      message: "当前环境是临时数据库，不能稳定创建修订。请切换到持久数据库环境后重试。"
    }, { status: 409 });
  }
  const recipeId = Number(context.params.id);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const data = createRecipeRevision(recipeId, String(body.created_by || ""));
    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "CREATE_REVISION_FAILED" }, { status: 500 });
  }
}
