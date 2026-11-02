import { describe, expect, it } from "vitest";
import { gstFromInclusive } from "@/services/billing";
import { dayKind } from "@/lib/calendar";

describe("GST", () => {
  it("is one eleventh of a GST-inclusive total", () => {
    expect(gstFromInclusive(4900 * 8)).toBe(3564);
    expect(gstFromInclusive(1100)).toBe(100);
  });
});

describe("lesson calendar", () => {
  it("skips Victorian public holidays and term breaks", () => {
    expect(dayKind("2027-03-08").kind).toBe("holiday");
    expect(dayKind("2027-04-01").kind).toBe("break");
    expect(dayKind("2027-02-08").kind).toBe("teaching");
  });
});
