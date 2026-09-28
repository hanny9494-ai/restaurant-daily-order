import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { deleteStocktake, getStocktake } from "@/lib/ops/stocktake";

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  return handle(() => {
    requireStaff(request);
    return { data: getStocktake(Number(context.params.id)) };
  });
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  return handle(() => {
    const actor = requireStaff(request, "CHEF");
    return deleteStocktake(Number(context.params.id), actor);
  });
}
