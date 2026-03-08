import { NextRequest, NextResponse } from "next/server";
import { confirmScannedReceiving } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const actorEmail = String(body.actor_email || "");
    const guard = await requirePermission("receiving:scan", actorEmail);
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error || "FORBIDDEN" }, { status: 403 });
    }
    const data = confirmScannedReceiving({
      date: String(body.date || ""),
      supplier_id: Number(body.supplier_id),
      items: Array.isArray(body.items) ? body.items : [],
      new_units: Array.isArray(body.new_units) ? body.new_units : [],
      scan_file_id: body.scan_file_id === undefined || body.scan_file_id === null ? null : Number(body.scan_file_id),
      actor_email: actorEmail
    });
    return NextResponse.json({
      success: true,
      daily_list_id: data.daily_list_id,
      items_created: data.items_created,
      new_units_created: data.new_units_created,
      is_locked: data.is_locked,
      message: "收货记录已保存（未锁定）"
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (
      code === "DATE_REQUIRED" ||
      code === "INVALID_SUPPLIER" ||
      code === "INVALID_SCAN_ITEMS" ||
      code === "INVALID_UNIT" ||
      code === "INVALID_SCAN_FILE" ||
      code === "INVALID_PRICE_UNIT_CONVERSION"
    ) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "DAILY_LIST_LOCKED") {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "SCAN_CONFIRM_FAILED" }, { status: 500 });
  }
}
