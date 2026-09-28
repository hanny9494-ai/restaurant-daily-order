import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { deleteScan } from "@/lib/ops/receiving";

// Excludes a scan from OCR matching (image is kept for audit).
export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  return handle(() => {
    const actor = requireStaff(request);
    return deleteScan(Number(context.params.id), actor);
  });
}
