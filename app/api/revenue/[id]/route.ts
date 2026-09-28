import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { deleteRevenue } from "@/lib/ops/cost";

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  return handle(() => {
    const actor = requireStaff(request, "MANAGER");
    return deleteRevenue(Number(context.params.id), actor);
  });
}
