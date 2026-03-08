import { NextResponse } from "next/server";
import { getRecipeStoreRuntimeStatus } from "@/lib/runtime-status";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function GET() {
  return NextResponse.json({
    data: {
      recipe_store: getRecipeStoreRuntimeStatus()
    }
  });
}

