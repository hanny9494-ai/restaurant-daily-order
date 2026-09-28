import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { saveCounts } from "@/lib/ops/stocktake";

// body: { counts: [{ item_id, input_quantity (null = not counted), input_unit }] } — several people can save different locations concurrently.
export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return handle(async () => {
    const actor = requireStaff(request);
    const body = await readJson(request);
    return { data: saveCounts(Number(context.params.id), body.counts, actor) };
  });
}
