import { createServerFn } from "@tanstack/react-start";
import {
  autosaveJoinAnswers,
  createInvitation,
  loadJoinSession,
  requestFamilyMagicLink,
  resendInvitation,
  runInviteReminders,
  submitJoinEnrolment,
  unlockJoinSession,
} from "@/services/invitations";

export const createInvitationFn = createServerFn({ method: "POST" })
  .validator((data: { familyId: string; studentIds: string[]; enrolmentDraftIds?: string[] }) => data)
  .handler(({ data }) => createInvitation(data));

export const resendInvitationFn = createServerFn({ method: "POST" })
  .validator((data: { invitationId: string }) => data)
  .handler(({ data }) => resendInvitation(data.invitationId));

export const loadJoinSessionFn = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(({ data }) => loadJoinSession(data.token));

export const unlockJoinSessionFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; turnstileToken?: string }) => data)
  .handler(({ data }) => unlockJoinSession(data));

export const autosaveJoinAnswersFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof autosaveJoinAnswers>[0]) => data)
  .handler(({ data }) => autosaveJoinAnswers(data));

export const submitJoinEnrolmentFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof submitJoinEnrolment>[0]) => data)
  .handler(({ data }) => submitJoinEnrolment(data));

export const requestFamilyMagicLinkFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; turnstileToken?: string }) => data)
  .handler(({ data }) => requestFamilyMagicLink(data));

export const runInviteRemindersFn = createServerFn({ method: "POST" }).handler(() => runInviteReminders());
