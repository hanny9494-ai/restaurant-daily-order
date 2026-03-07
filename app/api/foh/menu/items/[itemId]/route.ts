import { NextRequest, NextResponse } from "next/server";
import { removeFohMenuItem } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function DELETE(request: NextRequest, context: { params: { itemId: string } }) {
  const itemId = Number(context.params.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "INVALID_ITEM_ID" }, { status: 400 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const actorEmail = String(body?.actor_email || "");
    const guard = await requirePermission("foh:edit_menu", actorEmail);
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error || "FORBIDDEN" }, { status: 403 });
    }
    const data = removeFohMenuItem({
      item_id: itemId,
      actor_email: actorEmail
    });
    return NextResponse.json({
      success: true,
      ...data
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "REMOVE_MENU_ITEM_FAILED" }, { status: 500 });
  }
}
