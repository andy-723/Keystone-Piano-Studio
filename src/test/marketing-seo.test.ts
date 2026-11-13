import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MARKETING_HOME_TITLE,
  MARKETING_SITE_ORIGIN,
  SITEMAP_PATHS,
  marketingHomeHead,
} from "@/lib/marketing-seo";

describe("marketing SEO (S1 / S2)", () => {
  it("home head uses the marketing title and a canonical to /welcome", () => {
    const head = marketingHomeHead();
    expect(head.meta.some((entry) => "title" in entry && entry.title === MARKETING_HOME_TITLE)).toBe(
      true,
    );
    expect(head.links).toEqual([
      { rel: "canonical", href: `${MARKETING_SITE_ORIGIN}/welcome` },
    ]);
    expect(
      head.meta.some(
        (entry) =>
          "property" in entry &&
          entry.property === "og:url" &&
          entry.content === `${MARKETING_SITE_ORIGIN}/welcome`,
      ),
    ).toBe(true);
  });

  it("public/sitemap.xml lists every public marketing path", () => {
    const xml = readFileSync(resolve(process.cwd(), "public/sitemap.xml"), "utf8");
    for (const path of SITEMAP_PATHS) {
      expect(xml).toContain(`${MARKETING_SITE_ORIGIN}${path}`);
    }
    expect(xml).not.toContain(`${MARKETING_SITE_ORIGIN}/login`);
  });

  it("robots.txt points at the sitemap", () => {
    const robots = readFileSync(resolve(process.cwd(), "public/robots.txt"), "utf8");
    expect(robots).toContain(`Sitemap: ${MARKETING_SITE_ORIGIN}/sitemap.xml`);
  });
});
