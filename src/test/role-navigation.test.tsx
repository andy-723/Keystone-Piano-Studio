import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { AppSettingsProvider } from "@/lib/app-settings";
import { getStudio } from "@/services/roster";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getPlanBilling } from "@/services/plans";
import { getTeacherProfile } from '@/services/community';

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

afterEach(cleanup);

describe("teacher navigation permissions", () => {
  it("hides both teacher navigation bars for Parent (Wei Chen) and restores them for Teacher", async () => {
    const studio = await getStudio();
    const client = new QueryClient();
    client.setQueryData(["plan-billing", "demo"], await getPlanBilling());
    client.setQueryData(['teacher-profile','demo'],await getTeacherProfile());
    render(<QueryClientProvider client={client}><AppSettingsProvider><AppShell studio={studio}><p>Day-book</p></AppShell></AppSettingsProvider></QueryClientProvider>);
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(2);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "parent" } });
    expect(screen.queryAllByRole("navigation", { name: "Main" })).toHaveLength(0);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "teacher" } });
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(2);
  });
});