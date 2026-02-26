import { NextRequest, NextResponse } from "next/server";
import { generateDailyListSnapshot, getDailyListMetaByDate, upsertReceivingItemsAndLock } from "@/lib/db";
import { todayString } from "@/lib/date";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const date = body.date ? String(body.date) : todayString();
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: "items is required" }, { status: 400 });
    }

    type ReceivingRow = {
      daily_list_item_id: number;
      quality_ok: number;
      input_unit_price: number | null;
      price_unit: string | null;
      receive_note: string;
    };

    const items = (body.items
      .map((it: any) => ({
        daily_list_item_id: Number(it.daily_list_item_id),
        quality_ok: it.quality_ok === 1 || it.quality_ok === true ? 1 : 0,
        input_unit_price: it.input_unit_price === "" || it.input_unit_price === null || it.input_unit_price === undefined
          ? null
          : Number(it.input_unit_price),
        price_unit: it.price_unit ? String(it.price_unit) : null,
        receive_note: it.receive_note ? String(it.receive_note) : ""
      })) as ReceivingRow[])
      .filter((it) => it.daily_list_item_id > 0);

    if (items.length === 0) {
      return NextResponse.json({ error: "valid items required" }, { status: 400 });
    }

    generateDailyListSnapshot(date);
    const meta = getDailyListMetaByDate(date);
    if (meta.is_locked) {
      return NextResponse.json({ error: "daily list is locked" }, { status: 409 });
    }

    upsertReceivingItemsAndLock(date, items);
    const latestMeta = getDailyListMetaByDate(date);
    return NextResponse.json({ ok: true, meta: latestMeta });
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg === "DAILY_LIST_LOCKED") {
      return NextResponse.json({ error: "daily list is locked" }, { status: 409 });
    }
    if (msg === "INVALID_DAILY_LIST_ITEM" || msg === "DAILY_LIST_NOT_FOUND") {
      return NextResponse.json({ error: "invalid daily list items" }, { status: 400 });
    }
    if (msg === "INVALID_PRICE_UNIT_CONVERSION") {
      return NextResponse.json({ error: "invalid price unit conversion" }, { status: 400 });
    }
    if (msg.includes("JSON")) {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    return NextResponse.json({ error: "save receiving failed" }, { status: 500 });
  }
}
