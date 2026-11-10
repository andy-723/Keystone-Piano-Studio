#!/usr/bin/env node
// Release-safety checks for supabase/migrations (see docs/release-process.md).
//
//   node scripts/check-migrations.mjs            # file-layout checks only
//   BASE_REF=origin/main node scripts/check-migrations.mjs   # also compare with main (CI on PRs)
//
// Rules:
//  1. Every file is NNNN_snake_case.sql with a unique number. Rollbacks live in
//     supabase/rollbacks/, never in migrations/ (the Supabase CLI would read them as migrations).
//  2. New migrations (0007 onwards) ship a matching supabase/rollbacks/NNNN_name.rollback.sql.
//  3. A migration that is already on main is never edited, renamed or deleted. Fix forward with
//     a new migration instead, because production has already run the old one.
//  4. A new migration is numbered above everything on main.
//  5. Destructive statements (drop/rename/type change) need a "-- release: contract" header line,
//     so they only ship after the code that stopped using the old shape is live.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = "supabase/migrations";
const ROLLBACKS = "supabase/rollbacks";
const FIRST_VERSION_NEEDING_ROLLBACK = 7;
const NAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const DESTRUCTIVE =
  /\b(drop\s+(table|column|schema|type|function|view)|rename\s+(column|to)|alter\s+column\s+\w+\s+(set\s+data\s+)?type|truncate)\b/i;

const errors = [];
const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const seen = new Map();

for (const file of files) {
  const match = NAME.exec(file);
  if (!match) {
    errors.push(
      `${MIGRATIONS}/${file}: name must be NNNN_snake_case.sql (rollbacks go in ${ROLLBACKS}/).`,
    );
    continue;
  }
  const version = match[1];
  if (seen.has(version)) {
    errors.push(`${MIGRATIONS}/${file}: number ${version} is also used by ${seen.get(version)}.`);
  }
  seen.set(version, file);

  if (Number(version) >= FIRST_VERSION_NEEDING_ROLLBACK) {
    const rollback = join(ROLLBACKS, file.replace(/\.sql$/, ".rollback.sql"));
    if (!existsSync(rollback)) errors.push(`${MIGRATIONS}/${file}: add ${rollback}.`);
  }

  const sql = stripComments(readFileSync(join(MIGRATIONS, file), "utf8"));
  const header = readFileSync(join(MIGRATIONS, file), "utf8");
  if (
    Number(version) >= FIRST_VERSION_NEEDING_ROLLBACK &&
    DESTRUCTIVE.test(sql) &&
    !/^--\s*release:\s*contract\b/im.test(header)
  ) {
    errors.push(
      `${MIGRATIONS}/${file}: drops, renames or changes a type. Ship it as a separate "contract" ` +
        `migration (add a "-- release: contract" line) after the code that no longer needs the old ` +
        `shape is live. See docs/release-process.md.`,
    );
  }
}

const baseRef = process.env.BASE_REF;
if (baseRef) {
  const diff = git(`diff --name-status ${baseRef}...HEAD -- ${MIGRATIONS}`);
  const onMain = git(`ls-tree --name-only ${baseRef} ${MIGRATIONS}/`)
    .split("\n")
    .filter(Boolean)
    .map((p) => p.split("/").pop())
    .filter((f) => NAME.test(f));
  const maxOnMain = Math.max(0, ...onMain.map((f) => Number(NAME.exec(f)[1])));

  for (const line of diff.split("\n").filter(Boolean)) {
    const [status, ...paths] = line.split("\t");
    const file = paths[0].split("/").pop();
    if (status === "A") {
      const version = Number(NAME.exec(file)?.[1] ?? 0);
      if (version && version <= maxOnMain) {
        errors.push(
          `${paths[0]}: number must be above ${String(maxOnMain).padStart(4, "0")} (highest on ${baseRef}).`,
        );
      }
    } else if (onMain.includes(file)) {
      errors.push(
        `${paths[0]}: already on ${baseRef} (status ${status}). Production has run it, so don't ` +
          `change it. Write a new migration instead.`,
      );
    }
  }
}

if (errors.length) {
  console.error("Migration checks failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(
  `Migration checks passed (${files.length} migrations${baseRef ? `, compared with ${baseRef}` : ""}).`,
);

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8" }).trim();
}

function stripComments(sql) {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
