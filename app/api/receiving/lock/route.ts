import { NextRequest, NextResponse } from "next/server";
import { lockDailyListByDate } from "@/lib/db";
import { todayString } from "@/lib/date";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const date = String(body.date || todayString());
    const actor = String(body.actor_email || "");
    const guard = await requirePermission("receiving:lock", actor);
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error || "FORBIDDEN" }, { status: 403 });
    }
    const data = lockDailyListByDate(date, actor);
    return NextResponse.json({
      success: true,
      locked_at: data.receiving_locked_at
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "DAILY_LIST_NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "DAILY_LIST_LOCKED") {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "LOCK_FAILED" }, { status: 500 });
  }
}
