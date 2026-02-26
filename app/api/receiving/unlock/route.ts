import { NextRequest, NextResponse } from "next/server";
import { generateDailyListSnapshot, getDailyListMetaByDate, unlockDailyListByDate } from "@/lib/db";
import { todayString } from "@/lib/date";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = body?.date ? String(body.date) : todayString();

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
