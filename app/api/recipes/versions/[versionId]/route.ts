import { NextRequest, NextResponse } from "next/server";
import { updateRecipeDraft } from "@/lib/db";
import { hasPersistentRecipeStore } from "@/lib/runtime-status";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function PATCH(request: NextRequest, context: { params: { versionId: string } }) {
  if (!hasPersistentRecipeStore()) {
    return NextResponse.json({
      error: "PERSISTENT_DB_REQUIRED",
      message: "当前环境是临时数据库，不能稳定保存草稿。请切换到持久数据库环境后重试。"
    }, { status: 409 });
  }
  const versionId = Number(context.params.versionId);
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const data = updateRecipeDraft(versionId, {
      servings: typeof body.servings === "string" ? body.servings : undefined,
      instructions: typeof body.instructions === "string" ? body.instructions : undefined,
      change_note: typeof body.change_note === "string" ? body.change_note : undefined,
      ingredients: Array.isArray(body.ingredients) ? body.ingredients : undefined,
      recipe_record_json: body.recipe_record_json,
      actor: String(body.actor || "")
    });
    return NextResponse.json({ data });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (
      code === "INVALID_STAGE" ||
      code === "INSTRUCTIONS_REQUIRED" ||
      code === "INVALID_INGREDIENT_FIELDS" ||
      code === "INVALID_RECIPE_RECORD_JSON" ||
      code.startsWith("INVALID_RECIPE_RECORD")
    ) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "UPDATE_DRAFT_FAILED" }, { status: 500 });
  }
}
