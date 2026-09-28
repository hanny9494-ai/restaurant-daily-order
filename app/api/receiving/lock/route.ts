import { NextRequest, NextResponse } from "next/server";
import { lockDailyListByDate } from "@/lib/db";
import { todayString } from "@/lib/date";
import { requirePermission } from "@/lib/permissions";
import { staffFromRequest, requireStaff } from "@/lib/ops/auth";
import { handle } from "@/lib/ops/http";
import { reviewLock } from "@/lib/ops/receiving";
import { assertDate } from "@/lib/ops/common";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function POST(request: NextRequest) {
  // New flow: staff PIN session -> review lock (requires every supplier RECEIVED, records reviewer).
  if (staffFromRequest(request)) {
    return handle(async () => {
      const actor = requireStaff(request, "CHEF");
      const body = await request.json().catch(() => ({}));
      const board = reviewLock(assertDate(body?.date || todayString()), actor);
      return { success: true, locked_at: board.locked_at, data: board };
    });
  }
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
