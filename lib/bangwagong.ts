export async function pushRecipeToBangwagong(input: {
  recipe: unknown;
  version: unknown;
  event: "RECIPE_PUBLISHED" | "RECIPE_APPROVED";
}) {
  const endpoint = (process.env.BANGWAGONG_WEBHOOK_URL || "").trim();
  const token = (process.env.BANGWAGONG_API_TOKEN || "").trim();

  if (!endpoint) {
    return {
      ok: false,
      skipped: true,
      endpoint: "",
      error: "BANGWAGONG_WEBHOOK_URL_NOT_SET"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        event: input.event,
        timestamp: new Date().toISOString(),
        recipe: input.recipe,
        version: input.version
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        endpoint,
        error: `HTTP_${response.status}`
      };
    }
    return { ok: true, skipped: false, endpoint, error: "" };
  } catch (error: any) {
    return {
      ok: false,
      skipped: false,
      endpoint,
      error: String(error?.message || "REQUEST_FAILED")
    };
  } finally {
    clearTimeout(timeout);
  }
}
