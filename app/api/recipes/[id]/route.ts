import { NextResponse } from "next/server";
import { getRecipeDetail, updateRecipeBase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const recipeId = Number(context.params.id);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }
  const detail = getRecipeDetail(recipeId);
  if (!detail) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json(
    { data: detail },
    {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60"
      }
    }
  );
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const recipeId = Number(context.params.id);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const detail = updateRecipeBase(recipeId, {
      code: typeof body.code === "string" ? body.code : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      recipe_type: body.recipe_type === "MENU" ? "MENU" : (body.recipe_type === "BACKBONE" ? "BACKBONE" : undefined),
      menu_cycle: typeof body.menu_cycle === "string" ? body.menu_cycle : undefined,
      actor: String(body.actor || "")
    });
    return NextResponse.json({ data: detail });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "INVALID_RECIPE_FIELDS" || code === "MENU_CYCLE_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "UPDATE_RECIPE_FAILED" }, { status: 500 });
  }
}
