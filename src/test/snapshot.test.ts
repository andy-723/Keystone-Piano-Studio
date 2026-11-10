import { describe, expect, it, beforeEach } from "vitest";
import { PROTOTYPE_TODAY } from "@/lib/calendar";
import { canViewStudioSnapshot } from "@/lib/app-settings";
import { snapshotBounds } from "@/lib/snapshot-range";
import { resetInvitationState } from "@/mocks/invitations";
import {
  getStudioSnapshot,
  snapshotDrillCsv,
  resendSnapshotInvitation,
} from "@/services/snapshot";
import { listIncompleteInvitations } from "@/services/invitations";

beforeEach(() => {
  resetInvitationState();
});

describe("snapshot range", () => {
  it("uses Mon–Sun week and calendar month in Australia/Sydney", () => {
    const week = snapshotBounds("week", PROTOTYPE_TODAY);
    expect(week).toEqual({
      key: "week",
      start: "2027-03-15",
      end: "2027-03-21",
      timezone: "Australia/Sydney",
    });
    const month = snapshotBounds("month", PROTOTYPE_TODAY);
    expect(month).toEqual({
      key: "month",
      start: "2027-03-01",
      end: "2027-03-31",
      timezone: "Australia/Sydney",
    });
  });
});

describe("studio staff snapshot gate", () => {
  it("allows owners and admins only", () => {
    expect(canViewStudioSnapshot("owner")).toBe(true);
    expect(canViewStudioSnapshot("admin")).toBe(true);
    expect(canViewStudioSnapshot("teacher")).toBe(false);
  });
});

describe("getStudioSnapshot", () => {
  it("aggregates revenue, overdue, students, invites, practice and lessons for the week", async () => {
    const snapshot = await getStudioSnapshot("week");
    expect(snapshot.bounds.key).toBe("week");
    expect(snapshot.revenueCollectedCents).toBeGreaterThan(0);
    expect(snapshot.paidInvoices.length).toBeGreaterThan(0);
    expect(snapshot.overdueInvoices.length).toBeGreaterThan(0);
    expect(snapshot.overdueCents).toBeGreaterThan(0);
    expect(snapshot.activeStudents.length).toBeGreaterThan(0);
    expect(snapshot.incompleteInvites.length).toBeGreaterThan(0);
    expect(snapshot.practiceAtRisk.length).toBeGreaterThan(0);
    expect(
      snapshot.lessons.taught +
        snapshot.lessons.cancelled +
        snapshot.lessons.noShow +
        snapshot.lessons.scheduled,
    ).toBe(snapshot.lessons.rows.length);
  });

  it("month range includes earlier March payments and lesson history", async () => {
    const week = await getStudioSnapshot("week");
    const month = await getStudioSnapshot("month");
    expect(month.revenueCollectedCents).toBeGreaterThanOrEqual(week.revenueCollectedCents);
    expect(month.lessons.rows.length).toBeGreaterThan(week.lessons.rows.length);
  });

  it("exports CSV for the open drill list", async () => {
    const snapshot = await getStudioSnapshot("month");
    const file = snapshotDrillCsv("overdue", snapshot);
    expect(file.filename).toContain("overdue");
    expect(file.csv.split("\n")[0]).toContain("daysOverdue");
    expect(file.csv.split("\n").length).toBe(snapshot.overdueInvoices.length + 1);
  });

  it("can resend an incomplete invite from the snapshot list", async () => {
    const before = await listIncompleteInvitations();
    const target = before[0];
    expect(target).toBeTruthy();
    const result = await resendSnapshotInvitation(target!.id);
    expect(result.status).toBe("sent");
    const after = await listIncompleteInvitations();
    expect(after.some((invite) => invite.id === result.invitationId)).toBe(true);
    expect(after.some((invite) => invite.id === target!.id)).toBe(false);
  });
});
