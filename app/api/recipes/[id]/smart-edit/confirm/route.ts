import { NextRequest, NextResponse } from "next/server";
import { confirmSmartEdit } from "@/lib/db";
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
    const data = confirmSmartEdit({
      recipe_id: recipeId,
      version_id: Number(body.version_id),
      modified_record: body.modified_record,
      actor_email: actorEmail
    });
    return NextResponse.json({
      success: true,
      ...data
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code.startsWith("INVALID_RECIPE_RECORD")) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "SMART_EDIT_CONFIRM_FAILED" }, { status: 500 });
  }
}
