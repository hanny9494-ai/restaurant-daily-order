import { NextRequest, NextResponse } from "next/server";
import { getRecipeUsers } from "@/lib/db";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function GET(request: NextRequest) {
  const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "1";
  return NextResponse.json(
    { data: getRecipeUsers(includeInactive) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=120"
      }
    }
  );
}
