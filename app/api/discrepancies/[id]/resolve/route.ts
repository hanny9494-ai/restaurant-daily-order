import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { resolveDiscrepancy } from "@/lib/ops/discrepancies";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return handle(async () => {
    const actor = requireStaff(request, "RECEIVER");
    const body = await readJson(request);
    return { data: resolveDiscrepancy(Number(context.params.id), body, actor) };
  });
}
