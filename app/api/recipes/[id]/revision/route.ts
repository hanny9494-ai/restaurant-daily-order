import { NextRequest, NextResponse } from "next/server";
import { createRecipeRevision } from "@/lib/db";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
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
