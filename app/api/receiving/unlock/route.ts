import { NextRequest, NextResponse } from "next/server";
import { generateDailyListSnapshot, getDailyListMetaByDate, unlockDailyListByDate } from "@/lib/db";
import { todayString } from "@/lib/date";
import { requirePermission } from "@/lib/permissions";
import { staffFromRequest, requireStaff } from "@/lib/ops/auth";
import { handle } from "@/lib/ops/http";
import { reviewUnlock } from "@/lib/ops/receiving";
import { assertDate } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // New flow: staff PIN session (CHEF+) with a mandatory reason, logged in receiving_lock_logs.
  if (staffFromRequest(request)) {
    return handle(async () => {
      const actor = requireStaff(request, "CHEF");
      const body = await request.json().catch(() => ({}));
      const board = reviewUnlock(assertDate(body?.date || todayString()), String(body?.reason || ""), actor);
      return { ok: true, meta: { date: board.date, is_locked: board.is_locked, receiving_locked_at: board.locked_at }, data: board };
    });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const date = body?.date ? String(body.date) : todayString();
    // Legacy callers must at least identify an OWNER/EDITOR recipe user.
    const guard = await requirePermission("receiving:lock", String(body?.actor_email || ""));
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error || "FORBIDDEN" }, { status: 403 });
    }

    generateDailyListSnapshot(date);
    const meta = getDailyListMetaByDate(date);
    if (!meta.is_locked) {
      return NextResponse.json({ ok: true, meta });
    }

    const latestMeta = unlockDailyListByDate(date);
    return NextResponse.json({ ok: true, meta: latestMeta });
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg === "DAILY_LIST_NOT_FOUND") {
      return NextResponse.json({ error: "daily list not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "unlock failed" }, { status: 500 });
  }
}
