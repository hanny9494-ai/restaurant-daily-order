import { NextResponse } from "next/server";
import { OpsError } from "@/lib/ops/common";

export async function readJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    throw new OpsError("INVALID_JSON", 400);
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof OpsError) {
    return NextResponse.json({ error: error.message, detail: error.detail ?? null }, { status: error.status });
  }
  const message = String((error as any)?.message || "");
  console.error("[ops] unexpected error", error);
  return NextResponse.json({ error: "INTERNAL_ERROR", message: message.slice(0, 200) }, { status: 500 });
}

/** Wrap a route body: converts OpsError into JSON error responses. */
export async function handle(fn: () => Promise<unknown> | unknown) {
  try {
    const result = await fn();
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export function xlsxResponse(buffer: ArrayBuffer | Buffer, filename: string) {
  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    }
  });
}
