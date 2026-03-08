export type RecipeStoreRuntimeStatus = {
  mode: "persistent" | "ephemeral";
  provider: "sqlite-local" | "sqlite-tmp";
  reason: string;
};

export function getRecipeStoreRuntimeStatus(): RecipeStoreRuntimeStatus {
  const explicit = String(process.env.RECIPES_DB_MODE || "").trim().toLowerCase();
  const dataDir = String(process.env.DATA_DIR || process.env.APP_DATA_DIR || "").trim();
  if (explicit === "persistent") {
    return {
      mode: "persistent",
      provider: process.env.VERCEL ? "sqlite-local" : "sqlite-local",
      reason: "通过环境变量强制标记为持久模式。"
    };
  }
  if (explicit === "ephemeral") {
    return {
      mode: "ephemeral",
      provider: process.env.VERCEL ? "sqlite-tmp" : "sqlite-local",
      reason: "通过环境变量强制标记为临时模式。"
    };
  }
  if (process.env.VERCEL) {
    return {
      mode: "ephemeral",
      provider: "sqlite-tmp",
      reason: "当前部署运行在 Vercel 临时文件系统，SQLite 数据不会稳定持久化。"
    };
  }
  if (process.env.RENDER && dataDir) {
    return {
      mode: "persistent",
      provider: "sqlite-local",
      reason: `当前运行在 Render，并将数据目录挂载到 ${dataDir}。`
    };
  }
  return {
    mode: "persistent",
    provider: "sqlite-local",
    reason: "当前运行在本地文件系统，SQLite 数据可持久保存。"
  };
}

export function hasPersistentRecipeStore() {
  return getRecipeStoreRuntimeStatus().mode === "persistent";
}
