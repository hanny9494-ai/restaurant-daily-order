import { NextRequest, NextResponse } from "next/server";
import { listReceivingScanFiles } from "@/lib/db";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || "";
  const dateFrom = request.nextUrl.searchParams.get("date_from") || "";
  const dateTo = request.nextUrl.searchParams.get("date_to") || "";
  const data = listReceivingScanFiles({
    date: date || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined
  });
  return NextResponse.json({ data });
}
