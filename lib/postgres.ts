import { Pool } from "pg";

export type PostgresConnectionInfo = {
  connectionString: string;
  source: "POSTGRES_URL" | "DATABASE_URL";
};

let pool: Pool | null = null;

export function resolvePostgresConnection(): PostgresConnectionInfo | null {
  const postgresUrl = String(process.env.POSTGRES_URL || "").trim();
  if (postgresUrl) {
    return {
      connectionString: postgresUrl,
      source: "POSTGRES_URL"
    };
  }

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      source: "DATABASE_URL"
    };
  }

  return null;
}

export function hasPostgresConnection() {
  return Boolean(resolvePostgresConnection());
}

export function getPostgresPool() {
  if (pool) return pool;

  const connection = resolvePostgresConnection();
  if (!connection) {
    throw new Error("POSTGRES_URL_NOT_CONFIGURED");
  }

  pool = new Pool({
    connectionString: connection.connectionString,
    max: Number(process.env.PG_POOL_MAX || 5),
    ssl: shouldUseSsl(connection.connectionString)
      ? { rejectUnauthorized: false }
      : undefined
  });

  return pool;
}

export async function pingPostgres() {
  const db = getPostgresPool();
  const result = await db.query("select 1 as ok");
  return result.rows[0]?.ok === 1;
}

function shouldUseSsl(connectionString: string) {
  if (String(process.env.PGSSLMODE || "").trim().toLowerCase() === "disable") {
    return false;
  }
  if (/sslmode=disable/i.test(connectionString)) {
    return false;
  }
  return true;
}
