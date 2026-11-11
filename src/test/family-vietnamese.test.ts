import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import vi from "@/i18n/vi.json";
import { translate } from "@/i18n/parent";
import { helpText } from "@/lib/help/ui-text";
import { articleText, findArticle } from "@/lib/help/articles";

describe("family portal in Vietnamese", () => {
  it("has a Vietnamese line for every English line", () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });
  it("shows Vietnamese, not English, when Tiếng Việt is chosen", () => {
    expect(translate("vi", "payNow")).toBe("Thanh toán ngay");
    expect(translate("vi", "makeUpOwed", { count: 2 })).toBe("Số buổi học bù còn lại: 2");
    expect(helpText("vi", "helpCentre")).toBe("Trung tâm trợ giúp");
  });
  it("gives families Vietnamese help articles", () => {
    const article = findArticle("family-invoices");
    expect(article && articleText(article.title, "vi")).toBe("Hóa đơn và thanh toán cho studio");
  });
});
