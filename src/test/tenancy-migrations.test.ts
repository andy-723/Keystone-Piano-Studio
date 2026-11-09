/**
 * Structural check only — parses supabase/migrations/ and fails if a table
 * lacks `enable row level security` or a `studio_id` column unless allowlisted.
 * Not proof of isolation; see supabase/tests/tenancy.test.sql.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");

/** Tables that intentionally have no studio_id (with reason). */
const STUDIO_ID_ALLOWLIST: Record<string, string> = {
  studio: "studio itself",
  platform_staff: "Keystone platform operators — no studio tenancy (ADR-019 out of scope)",
  platform_audit: "platform-wide append-only audit — studio id optional on some events",
};

function sqlFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && !name.includes(".rollback."))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), "utf8") }));
}

function createdTables(sql: string): string[] {
  const tables: string[] = [];
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    if (match[1]) tables.push(match[1].toLowerCase());
  }
  return tables;
}

function hasRls(sql: string, table: string) {
  const re = new RegExp(
    `alter\\s+table\\s+(?:public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`,
    "i",
  );
  return re.test(sql);
}

function hasStudioIdColumn(allSql: string, table: string) {
  if (table === "studio") return true;
  // create table body contains studio_id, or later alter add column
  const createRe = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\);`,
    "i",
  );
  const match = createRe.exec(allSql);
  if (match?.[1]?.match(/\bstudio_id\b/i)) return true;
  const alterRe = new RegExp(
    `alter\\s+table\\s+(?:public\\.)?${table}\\s+add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?studio_id\\b`,
    "i",
  );
  return alterRe.test(allSql);
}

it("every migrated table enables RLS and has studio_id unless allowlisted", () => {
  const files = sqlFiles();
  expect(files.length).toBeGreaterThan(0);
  const allSql = files.map((file) => file.sql).join("\n\n");
  const tables = [...new Set(files.flatMap((file) => createdTables(file.sql)))];
  expect(tables.length).toBeGreaterThan(0);

  for (const table of tables) {
    expect(hasRls(allSql, table), `${table} must enable row level security`).toBe(true);
    if (STUDIO_ID_ALLOWLIST[table]) continue;
    expect(
      hasStudioIdColumn(allSql, table),
      `${table} must have studio_id (or be allowlisted)`,
    ).toBe(true);
  }
});
