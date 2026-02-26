import { NextRequest, NextResponse } from "next/server";
import { generateDailyListSnapshot, getDailyListItemsByDate, getDailyListMetaByDate } from "@/lib/db";
import { todayString } from "@/lib/date";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || todayString();
  const autoGenerate = request.nextUrl.searchParams.get("auto_generate") !== "0";

  if (autoGenerate) {
    generateDailyListSnapshot(date);
  }

  const items = getDailyListItemsByDate(date);
  const meta = getDailyListMetaByDate(date);
  return NextResponse.json({ data: items, meta });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const date = body.date ? String(body.date) : todayString();

    const id = generateDailyListSnapshot(date);
    const items = getDailyListItemsByDate(date);
    const meta = getDailyListMetaByDate(date);

    return NextResponse.json({ data: { id, items, meta } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
}
