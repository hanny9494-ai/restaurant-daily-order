import { NextResponse } from "next/server";
import { listPendingRecipeVersions } from "@/lib/db";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function GET() {
  return NextResponse.json(
    { data: listPendingRecipeVersions() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=8, stale-while-revalidate=30"
      }
    }
  );
}
