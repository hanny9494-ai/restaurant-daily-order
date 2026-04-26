import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

function resolvePostgresConnection() {
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

async function main() {
  const connection = resolvePostgresConnection();
  if (!connection) {
    console.error("POSTGRES_URL_NOT_CONFIGURED");
    process.exit(1);
  }

  const sqlPath = path.join(process.cwd(), "db", "postgres", "001_init.sql");
  if (!fs.existsSync(sqlPath)) {
    console.error(`SCHEMA_NOT_FOUND ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  const pool = new Pool({
    connectionString: connection.connectionString,
    max: Number(process.env.PG_POOL_MAX || 5),
    ssl: shouldUseSsl(connection.connectionString)
      ? { rejectUnauthorized: false }
      : undefined
  });
  console.log(`Applying schema via ${connection.source} ...`);
  await pool.query(sql);
  console.log("POSTGRES_SCHEMA_APPLIED");
  await pool.end();
}

main().catch((error) => {
  console.error("POSTGRES_MIGRATE_FAILED", error instanceof Error ? error.message : error);
  process.exit(1);
});

function shouldUseSsl(connectionString) {
  if (String(process.env.PGSSLMODE || "").trim().toLowerCase() === "disable") {
    return false;
  }
  if (/sslmode=disable/i.test(connectionString)) {
    return false;
  }
  return true;
}
