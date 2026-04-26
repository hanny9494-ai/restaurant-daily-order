import { NextResponse } from "next/server";
import { listApprovedRecipeVersionsRepo, listPendingRecipeVersionsRepo } from "@/lib/recipe-repo";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function GET() {
  return NextResponse.json(
    {
      data: {
        pending: await listPendingRecipeVersionsRepo(),
        approved: await listApprovedRecipeVersionsRepo()
      }
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=8, stale-while-revalidate=30"
      }
    }
  );
}
