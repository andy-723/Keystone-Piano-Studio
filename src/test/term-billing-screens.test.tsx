import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const prepare = vi.fn(async () => []);
vi.mock("@/services/live/term-billing-store", () => ({
  liveTermHolidays: () => [
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-03-29", name: "Easter Monday" },
  ],
  liveTermPreviewQuery: (input: { term: { key: string } }) => ({
    queryKey: ["live-term-billing", input],
    queryFn: async () => ({
      term: input.term,
      rule: "skip",
      campaign: null,
      families: [
        {
          familyId: "f-1",
          familyName: "Chen family",
          totalCents: 36000,
          renewal: "not_invited",
          invoice: null,
          ready: true,
          students: [
            {
              studentId: "k-1",
              name: "Mia Chen",
              familyId: "f-1",
              dates: ["2027-02-08"],
              skipped: ["2027-03-29"],
              makeUpDates: [],
              cancelled: 0,
              durationMin: 30,
              lessonName: "30 min lesson",
              unitCents: 4500,
              totalCents: 36000,
              problem: null,
              openCredits: 1,
            },
            {
              studentId: "k-2",
              name: "Leo Chen",
              familyId: "f-1",
              dates: ["2027-02-09"],
              skipped: [],
              makeUpDates: [],
              cancelled: 0,
              durationMin: 45,
              lessonName: null,
              unitCents: 0,
              totalCents: 0,
              problem: "no_price",
              openCredits: 0,
            },
          ],
        },
      ],
    }),
  }),
  liveTermDrafts: () => [],
  prepareLiveTermDrafts: () => prepare(),
  sendLiveTermInvoices: vi.fn(),
  liveRenewalQuery: () => ({ queryKey: ["live-renewals"], queryFn: async () => null }),
  sendLiveRenewalInvitations: vi.fn(),
  sendLiveRenewalReminders: vi.fn(),
  setLiveRenewalAnswer: vi.fn(),
}));

vi.mock("@/services/plans", () => ({ hasFeature: () => true }));

import { LiveBillNextTerm, LiveRenewals } from "@/components/LiveTermBilling";

afterEach(cleanup);
const wrap = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
);

describe("Bill next term screens on real studios", () => {
  it("shows the term, holidays, each student's lessons and what's missing", async () => {
    render(wrap(<LiveBillNextTerm />));
    expect(screen.getByRole("heading", { name: "Bill next term" })).toBeTruthy();
    expect(screen.getByLabelText("Term")).toBeTruthy();
    expect(screen.getByText(/Easter Monday/)).toBeTruthy();
    expect(await screen.findByText("Chen family")).toBeTruthy();
    expect(screen.getByText(/1 not charged/)).toBeTruthy();
    expect(screen.getByText(/1 make-up credit still to use/)).toBeTruthy();
    expect(screen.getByText(/No price for 45 min lessons/)).toBeTruthy();
    expect(screen.getByText(/not a registered tax or BAS agent/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Prepare drafts/ }));
    await vi.waitFor(() => expect(prepare).toHaveBeenCalled());
  });

  it("asks for a reply-by date before the first invitations", async () => {
    render(wrap(<LiveRenewals />));
    expect(
      await screen.findByRole("button", { name: /Send invitations to families/ }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Reply by/)).toBeTruthy();
  });
});
