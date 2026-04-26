export type RecipeStoreRuntimeStatus = {
  mode: "persistent" | "ephemeral";
  provider: "sqlite-local" | "sqlite-tmp" | "postgres";
  reason: string;
  data_dir: string;
  recipes_db_file: string;
  l0_db_file: string;
};

function isPostgresRecipeStoreEnabled() {
  return String(process.env.RECIPES_DB_PROVIDER || "").trim().toLowerCase() === "postgres";
}

export type PostgresRuntimeStatus = {
  configured: boolean;
  provider: "marketplace-postgres" | "generic-postgres" | "none";
  connection_source: "POSTGRES_URL" | "DATABASE_URL" | "none";
  reason: string;
};

export function getRecipeStoreRuntimeStatus(): RecipeStoreRuntimeStatus {
  const postgres = getPostgresRuntimeStatus();
  if (isPostgresRecipeStoreEnabled() && postgres.configured) {
    return {
      mode: "persistent",
      provider: "postgres",
      reason: "当前食谱主链已切换到 Postgres 持久数据库。",
      data_dir: "",
      recipes_db_file: "",
      l0_db_file: ""
    };
  }
  const explicit = String(process.env.RECIPES_DB_MODE || "").trim().toLowerCase();
  const dataDir = String(process.env.DATA_DIR || process.env.APP_DATA_DIR || "").trim();
  const resolvedDataDir = dataDir || (process.env.VERCEL ? "/tmp/data" : "./data");
  const recipesDbFile = String(process.env.RECIPES_DB_FILE || "app.db").trim();
  const l0DbFile = String(process.env.L0_DB_FILE || "l0_engine.db").trim();
  if (explicit === "persistent") {
    return {
      mode: "persistent",
      provider: process.env.VERCEL ? "sqlite-local" : "sqlite-local",
      reason: "通过环境变量强制标记为持久模式。",
      data_dir: resolvedDataDir,
      recipes_db_file: recipesDbFile,
      l0_db_file: l0DbFile
    };
  }
  if (explicit === "ephemeral") {
    return {
      mode: "ephemeral",
      provider: process.env.VERCEL ? "sqlite-tmp" : "sqlite-local",
      reason: "通过环境变量强制标记为临时模式。",
      data_dir: resolvedDataDir,
      recipes_db_file: recipesDbFile,
      l0_db_file: l0DbFile
    };
  }
  if (process.env.VERCEL) {
    return {
      mode: "ephemeral",
      provider: "sqlite-tmp",
      reason: "当前部署运行在 Vercel 临时文件系统，SQLite 数据不会稳定持久化。",
      data_dir: resolvedDataDir,
      recipes_db_file: recipesDbFile,
      l0_db_file: l0DbFile
    };
  }
  if (process.env.RENDER && dataDir) {
    return {
      mode: "persistent",
      provider: "sqlite-local",
      reason: `当前运行在 Render，并将数据目录挂载到 ${dataDir}。`,
      data_dir: resolvedDataDir,
      recipes_db_file: recipesDbFile,
      l0_db_file: l0DbFile
    };
  }
  return {
    mode: "persistent",
    provider: "sqlite-local",
    reason: "当前运行在本地文件系统，SQLite 数据可持久保存。",
    data_dir: resolvedDataDir,
    recipes_db_file: recipesDbFile,
    l0_db_file: l0DbFile
  };
}

export function hasPersistentRecipeStore() {
  if (isPostgresRecipeStoreEnabled() && getPostgresRuntimeStatus().configured) {
    return true;
  }
  return getRecipeStoreRuntimeStatus().mode === "persistent";
}

export function getPostgresRuntimeStatus(): PostgresRuntimeStatus {
  const postgresUrl = String(process.env.POSTGRES_URL || "").trim();
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  const hasVercelPostgresFamily = Boolean(
    postgresUrl
    || process.env.POSTGRES_PRISMA_URL
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.POSTGRES_USER
    || process.env.POSTGRES_HOST
    || process.env.POSTGRES_DATABASE
  );

  if (postgresUrl) {
    return {
      configured: true,
      provider: hasVercelPostgresFamily ? "marketplace-postgres" : "generic-postgres",
      connection_source: "POSTGRES_URL",
      reason: hasVercelPostgresFamily
        ? "已检测到 Vercel Marketplace Postgres 连接变量。"
        : "已检测到自定义 POSTGRES_URL。"
    };
  }

  if (databaseUrl) {
    return {
      configured: true,
      provider: "generic-postgres",
      connection_source: "DATABASE_URL",
      reason: "已检测到通用 DATABASE_URL，可用于 Postgres 迁移。"
    };
  }

  return {
    configured: false,
    provider: "none",
    connection_source: "none",
    reason: "当前未检测到 Postgres 连接变量。"
  };
}
