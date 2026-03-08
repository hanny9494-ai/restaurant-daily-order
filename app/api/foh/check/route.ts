import { NextRequest, NextResponse } from "next/server";
import { getFohCheckCatalog, runFohDietaryCheck, saveFohCheckRecord } from "@/lib/db";
import { callQwenJson, resolveQwenModel } from "@/lib/qwen";
import { todayString } from "@/lib/date";
import { buildFohCheckPrompt } from "@/lib/prompts";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const serviceDate = String(body.date || body.service_date || todayString()).trim();
    const restrictionRaw = Array.isArray(body.restrictions) ? body.restrictions.join(",") : String(body.restrictions || "");
    const restrictions = restrictionRaw
      .split(/[,\n，、;；]/g)
      .map((item: string) => item.trim())
      .filter((item: string) => Boolean(item));
    if (restrictions.length < 1) {
      return NextResponse.json({ error: "RESTRICTIONS_REQUIRED" }, { status: 400 });
    }
    const actorEmail = typeof body.actor_email === "string" ? body.actor_email : "";
    const guard = await requirePermission("foh:check", actorEmail);
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error || "FORBIDDEN" }, { status: 403 });
    }
    const menuRecipeIds = Array.isArray(body.menu_recipe_ids)
      ? body.menu_recipe_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
      : [];
    const catalog = getFohCheckCatalog({ date: serviceDate, recipe_ids: menuRecipeIds });
    const prompt = buildFohCheckPrompt({
      menu: catalog,
      restrictions: restrictions.join("，")
    });

    let result: any;
    let alreadySaved = false;
    try {
      const ai = await callQwenJson({
        model: resolveQwenModel("text"),
        systemPrompt: prompt,
        userText: "请严格按 JSON 返回。",
        timeoutMs: 45000
      });
      result = {
        safe: Array.isArray(ai?.safe) ? ai.safe : [],
        unsafe: Array.isArray(ai?.unsafe) ? ai.unsafe : [],
        uncertain: Array.isArray(ai?.uncertain) ? ai.uncertain : []
      };
    } catch {
      const fallback = runFohDietaryCheck({
        service_date: serviceDate,
        guest_name: typeof body.guest_name === "string" ? body.guest_name : "",
        table_no: typeof body.table_no === "string" ? body.table_no : "",
        restrictions,
        menu_recipe_ids: menuRecipeIds,
        created_by: actorEmail
      });
      result = {
        safe: fallback.safe_items.map((item) => ({ recipe_id: item.recipe_id, dish_name: item.name })),
        unsafe: fallback.blocked_items.map((item) => ({
          recipe_id: item.recipe_id,
          dish_name: item.name,
          reason: item.reasons.map((reason) => `${reason.restriction}: ${reason.evidence}`).join("；"),
          triggered_ingredients: item.reasons.map((reason) => reason.matched_token)
        })),
        uncertain: []
      };
      alreadySaved = true;
    }

    if (!alreadySaved) {
      saveFohCheckRecord({
        service_date: serviceDate,
        guest_name: typeof body.guest_name === "string" ? body.guest_name : "",
        table_no: typeof body.table_no === "string" ? body.table_no : "",
        restrictions,
        result,
        created_by: actorEmail
      });
    }

    return NextResponse.json({ success: true, results: result });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "SERVICE_DATE_REQUIRED" || code === "RESTRICTIONS_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    return NextResponse.json({ error: "FOH_CHECK_FAILED" }, { status: 500 });
  }
}
