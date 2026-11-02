import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { AppSettingsProvider } from "@/lib/app-settings";
import { getStudio } from "@/services/roster";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

afterEach(cleanup);

describe("teacher navigation permissions", () => {
  it("hides both teacher navigation bars for Parent (Wei Chen) and restores them for Teacher", async () => {
    const studio = await getStudio();
    render(<AppSettingsProvider><AppShell studio={studio}><p>Day-book</p></AppShell></AppSettingsProvider>);
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(2);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "parent" } });
    expect(screen.queryAllByRole("navigation", { name: "Main" })).toHaveLength(0);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "teacher" } });
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(2);
  });
});