import { NextRequest, NextResponse } from "next/server";
import { publishRecipeVersion, getRecipeDetail, logRecipeSync } from "@/lib/db";
import { pushRecipeToBangwagong } from "@/lib/bangwagong";
import { hasPersistentRecipeStore } from "@/lib/runtime-status";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function POST(request: NextRequest, context: { params: { versionId: string } }) {
  if (!hasPersistentRecipeStore()) {
    return NextResponse.json({
      error: "PERSISTENT_DB_REQUIRED",
      message: "当前环境是临时数据库，不能稳定发布版本。请切换到持久数据库环境后重试。"
    }, { status: 409 });
  }
  const versionId = Number(context.params.versionId);
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const version = publishRecipeVersion(versionId, String(body.publisher || ""));
    const recipe = getRecipeDetail(version.recipe_id);

    const syncResult = await pushRecipeToBangwagong({
      event: "RECIPE_PUBLISHED",
      recipe,
      version
    });

    if (syncResult.skipped) {
      logRecipeSync({
        recipe_id: version.recipe_id,
        recipe_version_id: version.id,
        event: "RECIPE_PUBLISHED",
        status: "SKIPPED",
        endpoint: syncResult.endpoint,
        error_message: syncResult.error
      });
    } else if (!syncResult.ok) {
      logRecipeSync({
        recipe_id: version.recipe_id,
        recipe_version_id: version.id,
        event: "RECIPE_PUBLISHED",
        status: "FAILED",
        endpoint: syncResult.endpoint,
        error_message: syncResult.error
      });
    } else {
      logRecipeSync({
        recipe_id: version.recipe_id,
        recipe_version_id: version.id,
        event: "RECIPE_PUBLISHED",
        status: "SUCCESS",
        endpoint: syncResult.endpoint
      });
    }

    return NextResponse.json({
      data: version,
      bangwagong: syncResult
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "INVALID_STAGE") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "PERMISSION_DENIED" || code === "USER_NOT_FOUND" || code === "ACTOR_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    return NextResponse.json({ error: "PUBLISH_FAILED" }, { status: 500 });
  }
}
