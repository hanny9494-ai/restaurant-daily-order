import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { submitStocktake } from "@/lib/ops/stocktake";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return handle(async () => {
    const actor = requireStaff(request);
    const body = await readJson(request).catch(() => ({}));
    return { data: submitStocktake(Number(context.params.id), { allow_uncounted: body?.allow_uncounted === true }, actor) };
  });
}
