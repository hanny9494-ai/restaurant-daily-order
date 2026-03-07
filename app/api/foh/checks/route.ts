import { NextRequest, NextResponse } from "next/server";
import { getFohChecksByDate } from "@/lib/db";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

function todayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(request: NextRequest) {
  const date = String(request.nextUrl.searchParams.get("date") || todayString());
  return NextResponse.json(
    { data: getFohChecksByDate(date) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=8, stale-while-revalidate=30"
      }
    }
  );
}
