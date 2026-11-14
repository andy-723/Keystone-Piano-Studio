import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { AppSettingsProvider } from "@/lib/app-settings";
import { ParentLanguageProvider, useParentLanguage } from "@/i18n/parent";
import {
  SITE_LANG_STORAGE_KEY,
  getSiteLang,
  setSiteLang,
  hydrateSiteLangFromStorage,
  readStoredSiteLang,
} from "@/i18n/marketing/site-lang";
import { getStudio } from "@/services/roster";
import { getPlanBilling } from "@/services/plans";
import { getTeacherProfile } from "@/services/community";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

function ParentProbe() {
  const { t, lang } = useParentLanguage();
  return (
    <p data-testid="parent-probe">
      {lang}:{t("largerText")}
    </p>
  );
}

beforeEach(() => {
  localStorage.clear();
  setSiteLang("en");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  setSiteLang("en");
});

describe("signed-in language preference", () => {
  it("persists site language in localStorage for this browser", () => {
    setSiteLang("zh-CN");
    expect(localStorage.getItem(SITE_LANG_STORAGE_KEY)).toBe("zh-CN");
    expect(readStoredSiteLang()).toBe("zh-CN");
    setSiteLang("en");
    hydrateSiteLangFromStorage();
    // After clearing mid-test simulation: write vi and rehydrate
    localStorage.setItem(SITE_LANG_STORAGE_KEY, "vi");
    expect(hydrateSiteLangFromStorage()).toBe("vi");
    expect(getSiteLang()).toBe("vi");
  });

  it("updates studio shell nav and larger-text label immediately", async () => {
    const studio = await getStudio();
    const client = new QueryClient();
    client.setQueryData(["plan-billing", "demo"], await getPlanBilling());
    client.setQueryData(["teacher-profile", "demo"], await getTeacherProfile());
    render(
      <QueryClientProvider client={client}>
        <AppSettingsProvider>
          <AppShell studio={studio}>
            <p>Day-book</p>
          </AppShell>
        </AppSettingsProvider>
      </QueryClientProvider>,
    );
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(screen.getByText("Larger text")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getAllByText("今日").length).toBeGreaterThan(0);
    expect(screen.getByText("放大文字")).toBeTruthy();
    expect(localStorage.getItem(SITE_LANG_STORAGE_KEY)).toBe("zh-CN");
  });

  it("family portal follows a saved preference over guardian preferred language", () => {
    setSiteLang("vi");
    render(
      <AppSettingsProvider>
        <ParentLanguageProvider initial="zh-CN">
          <ParentProbe />
        </ParentLanguageProvider>
      </AppSettingsProvider>,
    );
    expect(screen.getByTestId("parent-probe").textContent).toBe("vi:Chữ lớn hơn");
  });

  it("family portal seeds guardian preferred language when nothing is saved yet", () => {
    localStorage.clear();
    setSiteLang("en");
    localStorage.removeItem(SITE_LANG_STORAGE_KEY);
    // Reset in-memory store without writing storage, then ensure provider seeds.
    hydrateSiteLangFromStorage();
    render(
      <AppSettingsProvider>
        <ParentLanguageProvider initial="zh-CN">
          <ParentProbe />
        </ParentLanguageProvider>
      </AppSettingsProvider>,
    );
    expect(screen.getByTestId("parent-probe").textContent).toBe("zh-CN:放大文字");
    expect(localStorage.getItem(SITE_LANG_STORAGE_KEY)).toBe("zh-CN");
  });
});
