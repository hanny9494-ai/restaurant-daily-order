import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { reviewUnlock } from "@/lib/ops/receiving";

export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request, "CHEF");
    const body = await readJson(request);
    return { data: reviewUnlock(assertDate(body.date || localToday()), String(body.reason || ""), actor) };
  });
}
