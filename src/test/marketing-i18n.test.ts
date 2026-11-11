import { describe, expect, it } from "vitest";
import { siteText } from "@/i18n/marketing/site-lang";
import { zhSite } from "@/i18n/marketing/zh-CN";
import { viSite } from "@/i18n/marketing/vi";

describe("public website languages", () => {
  it("translates Request a studio into Chinese and Vietnamese", () => {
    expect(siteText("zh-CN", "Request a studio")).toBe("申请工作室");
    expect(siteText("vi", "Request a studio")).toBe("Yêu cầu studio");
    expect(siteText("en", "Request a studio")).toBe("Request a studio");
  });
  it("keeps the legal English-only notice in both languages", () => {
    const notice = "This document is available in English only. The English version applies.";
    expect(zhSite[notice]).toBeTruthy();
    expect(viSite[notice]).toBeTruthy();
  });
  it("covers the same English text in both dictionaries", () => {
    expect(Object.keys(viSite).sort()).toEqual(Object.keys(zhSite).sort());
  });
});
