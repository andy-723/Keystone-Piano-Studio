import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { appDate, appKeys } from "@/i18n/app";
import { setSiteLang, uiText, useSiteTranslation } from "@/i18n/marketing/site-lang";

afterEach(() => {
  cleanup();
  act(() => setSiteLang("en"));
  localStorage.clear();
});

describe("signed-in app translations", () => {
  it("translates the Bill next term page the coordinator flagged", () => {
    for (const key of [
      "All invoices",
      "Public holidays excluded",
      "Prepare family drafts",
      "Bill next term",
    ]) {
      expect(uiText("zh-CN", key)).not.toBe(key);
      expect(uiText("vi", key)).not.toBe(key);
    }
    expect(uiText("zh-CN", "Lessons in Term 2")).toBe("第 2 学期课程");
    expect(uiText("vi", "Lessons in Term 2")).toBe("Buổi học trong Học kỳ 2");
  });

  it("keeps every placeholder in both translations", () => {
    const keys = appKeys();
    expect(keys.length).toBeGreaterThan(1500);
    for (const key of keys) {
      const names = (key.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
      if (!names.length) continue;
      for (const lang of ["zh-CN", "vi"] as const) {
        const sample = key.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, n: string) =>
          /^(n|count|total|term|days|hours|weeks|year|seen|stage|minutes|n2|pct)$/.test(n)
            ? "7"
            : `X${n}X`,
        );
        const out = uiText(lang, sample);
        expect(out, `${lang}: ${key}`).not.toBeNull();
      }
    }
  });

  it("prints dates and times in each language", () => {
    expect(appDate("zh-CN", "Mon 16 Nov")).toBe("11月16日 周一");
    expect(appDate("zh-CN", "Monday 15 March 2027")).toBe("2027年3月15日 星期一");
    expect(appDate("vi", "Mon 16 Nov")).toBe("T2, 16 thg 11");
    expect(appDate("vi", "3:30 pm")).toBe("15:30");
    expect(uiText("zh-CN", "Mon 12 Apr · Mon 19 Apr")).toBe("4月12日 周一 · 4月19日 周一");
  });

  it("number placeholders never swallow a sentence", () => {
    expect(uiText("zh-CN", "45 min")).toBe("45 分钟");
    expect(uiText("zh-CN", "Weekly goal · 30 min")).toBe("每周目标 · 30 分钟");
  });
});

function Probe({ term }: { term: number }) {
  useSiteTranslation();
  return (
    <div>
      <h2>Lessons in Term {term}</h2>
      <p>Public holidays excluded</p>
      <p data-no-translate>Yes</p>
      <textarea defaultValue="Save" aria-label="Clause wording" />
      <input placeholder="Search students" />
    </div>
  );
}

describe("DOM translator", () => {
  it("translates split React text, attributes and placeholders, but not opted-out or typed text", async () => {
    const view = render(<Probe term={2} />);
    await act(async () => setSiteLang("zh-CN"));
    expect(view.container.querySelector("h2")?.textContent).toBe("第 2 学期课程");
    expect(view.getByText("已排除公共假日")).toBeTruthy();
    expect(view.getByText("Yes")).toBeTruthy();
    expect((view.container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Save");
    expect(view.container.querySelector("textarea")?.getAttribute("aria-label")).toBe("条款措辞");
    expect(view.container.querySelector("input")?.getAttribute("placeholder")).toBe("搜索学生");

    view.rerender(<Probe term={3} />);
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(view.container.querySelector("h2")?.textContent).toBe("第 3 学期课程");

    await act(async () => setSiteLang("en"));
    expect(view.container.querySelector("h2")?.textContent).toBe("Lessons in Term 3");
    expect(view.getByText("Public holidays excluded")).toBeTruthy();
  });
});
