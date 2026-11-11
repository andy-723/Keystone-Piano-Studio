import { describe, expect, it } from "vitest";
import {
  getMarketingFinance,
  homeOfficeEstimateCents,
  marketingSnapshotCsv,
  marketingTaxCsv,
} from "@/services/marketing-finance";

describe("isolated marketing finance examples", () => {
  it("illustrates 480 home studio hours at 70 cents as $336", () => {
    expect(homeOfficeEstimateCents(480, 70)).toBe(33600);
  });
  it("records on-charged costs as income with the cost as an expense in the example export", () => {
    const csv = marketingTaxCsv();
    expect(csv).toContain("Gross tuition,33600.00");
    expect(csv).toContain("Book on-charged to family (income; cost recorded as expense),35.00");
  });
  it("exports the selected period's values", () => {
    expect(marketingSnapshotCsv("week")).toContain('Revenue collected,"$1,680",week');
    expect(marketingSnapshotCsv("month")).toContain('Revenue collected,"$5,040",month');
  });
  it("returns independent examples rather than editable studio records", async () => {
    const first = await getMarketingFinance();
    first.tax.grossCents = 0;
    expect((await getMarketingFinance()).tax.grossCents).toBe(3360000);
  });
});
