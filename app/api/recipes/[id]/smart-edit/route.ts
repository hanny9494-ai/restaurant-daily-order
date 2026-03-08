import { NextRequest, NextResponse } from "next/server";
import { getRecipeDetail } from "@/lib/db";
import { callQwenJson, resolveQwenModel } from "@/lib/qwen";
import { buildRecipeSmartEditPrompt } from "@/lib/prompts";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const recipeId = Number(context.params.id);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return NextResponse.json({ error: "INVALID_RECIPE_ID" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const actorEmail = String(body.actor_email || "");
    const guard = await requirePermission("recipe:smart_edit", actorEmail);
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error || "FORBIDDEN" }, { status: 403 });
    }

    const versionId = Number(body.version_id);
    const instruction = String(body.instruction || "").trim();
    if (!Number.isInteger(versionId) || versionId <= 0) {
      return NextResponse.json({ error: "INVALID_VERSION_ID" }, { status: 400 });
    }
    if (!instruction) {
      return NextResponse.json({ error: "INSTRUCTION_REQUIRED" }, { status: 400 });
    }

    const detail = getRecipeDetail(recipeId);
    if (!detail) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const version = detail.versions.find((item) => item.id === versionId);
    if (!version) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    let currentRecord: any = {};
    try {
      currentRecord = JSON.parse(version.recipe_record_json || "{}");
    } catch {
      currentRecord = {};
    }

    const ai = await callQwenJson({
      model: resolveQwenModel("text"),
      systemPrompt: buildRecipeSmartEditPrompt({ currentRecord, instruction }),
      userText: "请返回完整 modified_record 和 changes。",
      timeoutMs: 45000
    });

    const modifiedRecord = ai?.modified_record;
    if (!modifiedRecord || typeof modifiedRecord !== "object") {
      return NextResponse.json({ error: "INVALID_AI_OUTPUT" }, { status: 500 });
    }
    const changes = Array.isArray(ai?.changes) ? ai.changes : [];
    const diff = {
      ingredients: changes.filter((item: any) => item?.type === "ingredient"),
      steps: changes.filter((item: any) => item?.type === "step"),
      meta: changes.filter((item: any) => item?.type === "meta"),
      production: changes.filter((item: any) => item?.type === "production"),
      allergens: changes.filter((item: any) => item?.type === "allergen")
    };

    const data = {
      diff,
      modified_record: modifiedRecord,
      summary: String(ai?.summary || "智能微调完成")
    };
    return NextResponse.json({
      success: true,
      ...data
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "INSTRUCTION_REQUIRED" || code === "INVALID_RECIPE_RECORD_JSON" || code === "AI_TIMEOUT") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "SMART_EDIT_FAILED" }, { status: 500 });
  }
}
