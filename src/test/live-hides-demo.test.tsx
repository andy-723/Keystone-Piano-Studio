import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetStudioWorkspaceForTests, setStudioWorkspace } from "@/lib/studio-workspace";
import { MessageTranslation } from "@/components/MessageTranslation";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

afterEach(() => {
  cleanup();
  resetStudioWorkspaceForTests();
});

const live = () =>
  setStudioWorkspace({ mode: "live", studioId: "studio-1", role: "owner" } as never);
const wrap = (node: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
);

describe("demo-only features stay out of real studios", () => {
  it("shows the canned chat translation only in the demo", () => {
    const { unmount } = render(wrap(<MessageTranslation messageId="m1" body="你好老师" />));
    expect(screen.getByRole("button", { name: "Show translation" })).toBeTruthy();
    unmount();
    live();
    const { container } = render(wrap(<MessageTranslation messageId="m1" body="你好老师" />));
    expect(container.innerHTML).toBe("");
  });
});
