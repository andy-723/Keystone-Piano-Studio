import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProCfoPanel, PRO_CFO_TEASER_ITEMS } from "@/components/snapshot/ProCfoPanel";
import { getProCfoPack } from "@/services/pro-cfo";
import { setStudioPlan } from "@/services/plans";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

afterEach(async () => {
  cleanup();
  await setStudioPlan("pro");
});

async function renderPanel() {
  const client = new QueryClient();
  client.setQueryData(["pro-cfo"], await getProCfoPack());
  render(
    <QueryClientProvider client={client}>
      <ProCfoPanel />
    </QueryClientProvider>,
  );
}

describe("Pro CFO plan gating", () => {
  it("shows Base studios a locked teaser with no figures", async () => {
    await setStudioPlan("base");
    await renderPanel();
    expect(screen.getByText("Upgrade to Pro")).toBeTruthy();
    for (const item of PRO_CFO_TEASER_ITEMS) expect(screen.getByText(item)).toBeTruthy();
    expect(screen.queryByText("Net cash collected")).toBeNull();
    expect(screen.queryByLabelText("GST threshold monitor")).toBeNull();
  });

  it("shows Pro studios the full panel without the Snapshot duplicates", async () => {
    await setStudioPlan("pro");
    await renderPanel();
    expect(screen.queryByText("Upgrade to Pro")).toBeNull();
    expect(screen.getByText("Net cash collected")).toBeTruthy();
    expect(screen.getByLabelText("GST threshold monitor")).toBeTruthy();
    expect(screen.queryByLabelText("Overdue chaser")).toBeNull();
    expect(screen.queryByText("Students who may need a check-in")).toBeNull();
  });
});
