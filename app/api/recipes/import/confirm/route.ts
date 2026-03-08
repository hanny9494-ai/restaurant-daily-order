import { NextRequest, NextResponse } from "next/server";
import { createImportedRecipeDrafts } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { hasPersistentRecipeStore } from "@/lib/runtime-status";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

type DraftItem = {
  dish_name: string;
  dish_code?: string;
  recipe_type?: "MENU" | "BACKBONE";
  menu_cycle?: string | null;
  plating_image_url?: string;
  servings?: string;
  net_yield_rate?: number;
  allergens?: string[];
  diet_flags?: string[];
  ingredients?: Array<{ name: string; quantity: string; unit: string; note?: string }>;
  steps?: Array<{ step_no?: number; action: string; time_sec?: number; temp_c?: number; ccp?: string; note?: string }>;
};

function toRecipeRecord(item: DraftItem, index: number) {
  const recipeType = item.recipe_type === "BACKBONE" ? "BACKBONE" : "MENU";
  return {
    meta: {
      dish_code: String(item.dish_code || `AUTO-CONFIRM-${index + 1}`),
      dish_name: String(item.dish_name || "").trim(),
      recipe_type: recipeType,
      menu_cycle: recipeType === "MENU" ? (item.menu_cycle ? String(item.menu_cycle).trim() : null) : null,
      plating_image_url: String(item.plating_image_url || "")
    },
    production: {
      servings: String(item.servings || "1份"),
      net_yield_rate: Number.isFinite(Number(item.net_yield_rate)) ? Number(item.net_yield_rate) : 1,
      key_temperature_points: []
    },
    allergens: Array.isArray(item.allergens) ? item.allergens.map((x) => String(x).trim()).filter(Boolean) : [],
    diet_flags: Array.isArray(item.diet_flags) ? item.diet_flags.map((x) => String(x).trim()).filter(Boolean) : [],
    ingredients: Array.isArray(item.ingredients) && item.ingredients.length > 0
      ? item.ingredients.map((ing) => ({
          name: String(ing.name || "").trim(),
          quantity: String(ing.quantity || "").trim(),
          unit: String(ing.unit || "").trim(),
          note: String(ing.note || "")
        }))
      : [{ name: "待补充主料", quantity: "1", unit: "份", note: "" }],
    steps: Array.isArray(item.steps) && item.steps.length > 0
      ? item.steps.map((s, stepIdx) => ({
          step_no: Number(s.step_no || stepIdx + 1),
          action: String(s.action || "").trim(),
          time_sec: Number(s.time_sec || 0),
          ...(s.temp_c !== undefined ? { temp_c: Number(s.temp_c) } : {}),
          ...(s.ccp ? { ccp: String(s.ccp) } : {}),
          ...(s.note ? { note: String(s.note) } : {})
        }))
      : [{ step_no: 1, action: "待补充制作步骤", time_sec: 0 }]
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!hasPersistentRecipeStore()) {
      return NextResponse.json({
        error: "PERSISTENT_DB_REQUIRED",
        message: "当前环境是临时数据库，不能稳定创建草稿。请切换到持久数据库环境后重试。"
      }, { status: 409 });
    }
    const body = await request.json();
    const actorEmail = String(body.actor_email || "");
    const guard = await requirePermission("recipe:import", actorEmail);
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error || "FORBIDDEN" }, { status: 403 });
    }
    const recipesFromDraft = Array.isArray(body.draft_items)
      ? (body.draft_items as DraftItem[]).map((item, index) => toRecipeRecord(item, index))
      : null;
    const recipes = recipesFromDraft || (Array.isArray(body.recipes) ? body.recipes : []);
    const created = createImportedRecipeDrafts({
      actor_email: actorEmail,
      recipes,
      v3_preview: body.v3_preview
    });
    return NextResponse.json({
      success: true,
      created
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (
      code === "RECIPES_REQUIRED" ||
      code === "DISH_NAME_REQUIRED" ||
      code.startsWith("INVALID_RECIPE_RECORD")
    ) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "RECIPE_IMPORT_CONFIRM_FAILED" }, { status: 500 });
  }
}
