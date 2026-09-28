import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { approveStocktake } from "@/lib/ops/stocktake";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return handle(() => {
    const actor = requireStaff(request, "CHEF");
    return { data: approveStocktake(Number(context.params.id), actor) };
  });
}
