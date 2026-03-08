import { NextRequest, NextResponse } from "next/server";
import { addFohMenuItem } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const actorEmail = String(body.actor_email || "");
    const guard = await requirePermission("foh:edit_menu", actorEmail);
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error || "FORBIDDEN" }, { status: 403 });
    }
    const data = addFohMenuItem({
      date: String(body.date || ""),
      recipe_id: Number(body.recipe_id),
      actor_email: actorEmail
    });
    return NextResponse.json({
      success: true,
      ...data
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "DATE_REQUIRED" || code === "INVALID_RECIPE_ID") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "ADD_MENU_ITEM_FAILED" }, { status: 500 });
  }
}
