import { expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BODY_LIMIT_EXCEPTIONS,
  DEFAULT_BODY_LIMIT_BYTES,
  readJsonWithLimit,
} from "@/server/body-limit";

const apiDir = join(process.cwd(), "src/routes/api");

it("documents the Stripe billing webhook raw-body exception", () => {
  expect(
    BODY_LIMIT_EXCEPTIONS.some((entry) => entry.route.includes("stripe/billing-webhook")),
  ).toBe(true);
});

it("every server API route applies a body size limit (or is documented)", () => {
  const files: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".ts")) files.push(path);
    }
  }
  walk(apiDir);

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const relative = file.slice(process.cwd().length);
    const isGetOnly = !/method:\s*"POST"|POST:\s*async/.test(source) && /GET:\s*async/.test(source);
    const hasLimit =
      source.includes("readJsonWithLimit") ||
      source.includes("BODY_LIMIT") ||
      source.includes("content-length") ||
      source.includes(".slice(0,");
    const isException = BODY_LIMIT_EXCEPTIONS.some((entry) =>
      relative.includes(entry.route.replace(/^\//, "")),
    );
    if (isGetOnly) continue;
    expect(hasLimit || isException, `${relative} needs a body size limit`).toBe(true);
  }
});

it("readJsonWithLimit rejects oversized bodies", async () => {
  const big = "x".repeat(DEFAULT_BODY_LIMIT_BYTES + 10);
  const request = new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(big.length + 2) },
    body: JSON.stringify(big),
  });
  await expect(readJsonWithLimit(request)).rejects.toThrow("Request body too large");
});
