import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { getDayBoard } from "@/lib/ops/receiving";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request);
    const date = assertDate(request.nextUrl.searchParams.get("date") || localToday());
    return { data: getDayBoard(date) };
  });
}
