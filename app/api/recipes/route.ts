import { NextRequest, NextResponse } from "next/server";
import { createRecipeWithDraft, listRecipes } from "@/lib/db";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function GET() {
  return NextResponse.json(
    { data: listRecipes() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=120"
      }
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const detail = createRecipeWithDraft({
      code: String(body.code || ""),
      name: String(body.name || ""),
      description: typeof body.description === "string" ? body.description : "",
      recipe_type: body.recipe_type === "MENU" ? "MENU" : "BACKBONE",
      menu_cycle: typeof body.menu_cycle === "string" ? body.menu_cycle : "",
      servings: typeof body.servings === "string" ? body.servings : "",
      instructions: String(body.instructions || ""),
      change_note: typeof body.change_note === "string" ? body.change_note : "",
      created_by: String(body.created_by || ""),
      ingredients: Array.isArray(body.ingredients) ? body.ingredients : []
    });
    return NextResponse.json({ data: detail }, { status: 201 });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (
      code === "INVALID_RECIPE_FIELDS" ||
      code === "MENU_CYCLE_REQUIRED" ||
      code === "INSTRUCTIONS_REQUIRED" ||
      code === "INGREDIENTS_REQUIRED" ||
      code === "INVALID_INGREDIENT_FIELDS" ||
      code.startsWith("INVALID_RECIPE_RECORD")
    ) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "CREATE_RECIPE_FAILED" }, { status: 500 });
  }
}
