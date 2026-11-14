import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FocusLayout } from "@/components/onboarding/FocusLayout";
import { AppSettingsProvider } from "@/lib/app-settings";
import {
  SITE_LANG_STORAGE_KEY,
  setSiteLang,
  getSiteLang,
} from "@/i18n/marketing/site-lang";
import { tSetup } from "@/i18n/setup-wizard";
import { tOnboarding } from "@/i18n/onboarding";

beforeEach(() => {
  localStorage.clear();
  setSiteLang("en");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  setSiteLang("en");
});

describe("onboarding wizard language", () => {
  it("FocusLayout language buttons write keystone.siteLang and update the footer", () => {
    render(
      <AppSettingsProvider>
        <FocusLayout studioName="Clarke Piano Studio" progress={0.2}>
          <p>Step body</p>
        </FocusLayout>
      </AppSettingsProvider>,
    );
    expect(screen.getByText(tOnboarding("en", "powered"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(getSiteLang()).toBe("zh-CN");
    expect(localStorage.getItem(SITE_LANG_STORAGE_KEY)).toBe("zh-CN");
    expect(screen.getByText(tOnboarding("zh-CN", "powered"))).toBeTruthy();
  });

  it("translates setup wizard chrome and studio-terms step titles", () => {
    expect(tSetup("zh-CN", "Tell us about your studio")).toBe("介绍一下您的工作室");
    expect(tSetup("vi", "Continue")).toBe("Tiếp tục");
    expect(tSetup("zh-CN", "What is your studio's legal name?")).toBe("工作室的法定名称是什么？");
    expect(tSetup("en", "Save and continue")).toBe("Save and continue");
    expect(tSetup("zh-CN", "Step {n} of {total}", { n: 2, total: 5 })).toBe("第 2 步，共 5 步");
  });
});
