import { NextRequest, NextResponse } from "next/server";
import { getFohMenuByDate } from "@/lib/db";
import { todayString } from "@/lib/date";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function GET(request: NextRequest) {
  try {
    const date = String(request.nextUrl.searchParams.get("date") || todayString());
    const data = getFohMenuByDate(date);
    return NextResponse.json({
      success: true,
      ...data
    });
  } catch {
    return NextResponse.json({ error: "FOH_MENU_FAILED" }, { status: 500 });
  }
}
