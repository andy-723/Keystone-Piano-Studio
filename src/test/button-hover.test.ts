import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";

describe("button hover and focus affordances", () => {
  it("default variant darkens on hover and shows a focus ring", () => {
    const classes = buttonVariants({ variant: "default" });
    expect(classes).toContain("hover:bg-primary-hover");
    expect(classes).toContain("focus-visible:ring-2");
    expect(classes).toContain("focus-visible:ring-offset-2");
  });

  it("outline and ghost lighten paper on hover", () => {
    expect(buttonVariants({ variant: "outline" })).toContain("hover:bg-accent-hover");
    expect(buttonVariants({ variant: "ghost" })).toContain("hover:bg-accent-hover");
  });

  it("link underlines on hover", () => {
    expect(buttonVariants({ variant: "link" })).toContain("hover:underline");
  });

  it("shared Art Deco ks-btn classes cover admin/studio/family raw buttons", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toContain(".ks-btn-primary");
    expect(css).toContain(".ks-btn-secondary");
    expect(css).toContain(".ks-btn-tab");
    expect(css).toMatch(/\.ks-btn-primary:hover:not\(:disabled\)/);
    expect(css).toContain(".ks-btn:focus-visible");

    const admin = readFileSync(resolve(process.cwd(), "src/routes/admin.tsx"), "utf8");
    expect(admin).toContain("ks-btn ks-btn-tab");
    expect(admin).toContain("ks-btn ks-btn-primary");
    expect(admin).toContain("ks-btn ks-btn-secondary");

    const parent = readFileSync(resolve(process.cwd(), "src/components/ParentPortal.tsx"), "utf8");
    expect(parent).toContain("hover:bg-accent-hover");

    const studio = readFileSync(resolve(process.cwd(), "src/components/StudioAccessNotice.tsx"), "utf8");
    expect(studio).toContain("ks-btn ks-btn-primary");
  });
});
