import { afterEach, beforeEach, expect, it } from "vitest";
import { ProblemError, resetMockMemberships, requireStudioRole } from "@/server/authz";
import {
  createInvitationPrivileged,
  loadJoinSessionPrivileged,
  resendInvitationPrivileged,
} from "@/server/invitations";
import { cancelledNotificationQueue, removeMember } from "@/server/members";
import { resetInvitationState } from "@/mocks/invitations";

beforeEach(() => {
  resetInvitationState();
  resetMockMemberships([
    { userId: "owner-a", studioId: "studio-1", role: "owner" },
    { userId: "teacher-a", studioId: "studio-1", role: "teacher" },
    { userId: "teacher-b", studioId: "studio-b", role: "teacher" },
  ]);
  cancelledNotificationQueue.length = 0;
});

afterEach(() => {
  resetMockMemberships();
  cancelledNotificationQueue.length = 0;
});

it("requireStudioRole refuses the wrong studio", async () => {
  await expect(requireStudioRole("teacher-b", "studio-1", ["teacher"])).rejects.toBeInstanceOf(
    ProblemError,
  );
  await expect(requireStudioRole("teacher-b", "studio-1", ["teacher"])).rejects.toMatchObject({
    status: 403,
  });
});

it("createInvitationPrivileged refuses a user from another studio", async () => {
  await expect(
    createInvitationPrivileged({
      actorUserId: "teacher-b",
      familyId: "fam-1",
      studentIds: ["stu-1"],
    }),
  ).rejects.toMatchObject({ status: 403 });
});

it("createInvitationPrivileged refuses a forged studio_id", async () => {
  await expect(
    createInvitationPrivileged({
      actorUserId: "teacher-a",
      familyId: "fam-1",
      studentIds: ["stu-1"],
      studioId: "studio-forged",
    }),
  ).rejects.toMatchObject({ status: 403 });
});

it("resendInvitationPrivileged ignores/refuses forged studio_id", async () => {
  await expect(
    resendInvitationPrivileged({
      actorUserId: "teacher-a",
      invitationId: "missing",
      studioId: "studio-forged",
    }),
  ).rejects.toMatchObject({ status: 403 });
});

it("loadJoinSessionPrivileged ignores forged studio_id on the public token route", async () => {
  const result = await loadJoinSessionPrivileged({
    token: "not-a-real-token",
    studioId: "studio-forged",
  });
  expect(result.state).toBe("unavailable");
});

it("removeMember requires owner/admin and signs out (mock)", async () => {
  await expect(removeMember("studio-1", "teacher-a", "teacher-a")).rejects.toMatchObject({
    status: 403,
  });
  await expect(removeMember("studio-1", "teacher-a", "owner-a")).resolves.toEqual({
    removed: true,
    sessionsRevoked: true,
  });
  expect(cancelledNotificationQueue).toHaveLength(1);
});
