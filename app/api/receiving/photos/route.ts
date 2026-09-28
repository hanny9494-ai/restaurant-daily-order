import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { uploadProblemPhoto } from "@/lib/ops/receiving";

export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request);
    const body = await readJson(request);
    const date = assertDate(body.date || localToday());
    return {
      data: uploadProblemPhoto({
        date,
        supplier_id: body.supplier_id ? Number(body.supplier_id) : null,
        image_base64: String(body.image || ""),
        file_name: body.file_name,
        mime_type: body.mime_type
      }, actor)
    };
  });
}
