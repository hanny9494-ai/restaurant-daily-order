import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { createStocktake, listStocktakes } from "@/lib/ops/stocktake";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request);
    return { data: listStocktakes() };
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request, "CHEF");
    return { data: createStocktake(await readJson(request), actor) };
  });
}
