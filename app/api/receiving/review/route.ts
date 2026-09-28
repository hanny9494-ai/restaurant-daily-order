import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { reviewLock } from "@/lib/ops/receiving";

// CHEF/MANAGER review: all suppliers must be RECEIVED, then the day is locked.
export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request, "CHEF");
    const body = await readJson(request);
    return { data: reviewLock(assertDate(body.date || localToday()), actor) };
  });
}
