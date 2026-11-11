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
});
