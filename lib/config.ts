// Reserved multi-port setup: frontend can target a standalone API origin later.
export const SERVICE_PORTS = {
  web: Number(process.env.PORT || 3000),
  api: Number(process.env.API_PORT || 3000)
} as const;

export function getApiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}
