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
import { requireStudioRole, forbidden } from "./authz";
import { getStudioAccess } from "./subscription-store";
import { createServiceSupabase } from "./supabase";
import { isMockOnboarding } from "./env";
import { sha256Hex } from "@/lib/onboarding/crypto";

const DEMO_STUDIO_ID = "studio-1";

/**
 * Staff create-invitation path. Studio is derived from the family / demo scope —
 * any studioId in the body is refused if it does not match.
 */
export async function createInvitationPrivileged(input: {
  actorUserId: string;
  familyId: string;
  studentIds: string[];
  enrolmentDraftIds?: string[] | undefined;
  /** Forged client studio — ignored unless it mismatches the derived studio (then refused). */
  studioId?: string | undefined;
}) {
  const derivedStudioId = DEMO_STUDIO_ID;
  if (input.studioId && input.studioId !== derivedStudioId) {
    throw forbidden("studio_id from the client does not match the family's studio.");
  }
  // Privileged path — requireStudioRole before any write.
  await requireStudioRole(input.actorUserId, derivedStudioId, ["owner", "admin", "teacher"]);
  return createInvitation({
    familyId: input.familyId,
    studentIds: input.studentIds,
    enrolmentDraftIds: input.enrolmentDraftIds,
  });
}

export async function resendInvitationPrivileged(input: {
  actorUserId: string;
  invitationId: string;
  studioId?: string;
}) {
  const derivedStudioId = DEMO_STUDIO_ID;
  if (input.studioId && input.studioId !== derivedStudioId) {
    throw forbidden("studio_id from the client does not match the invitation's studio.");
  }
  await requireStudioRole(input.actorUserId, derivedStudioId, ["owner", "admin", "teacher"]);
  return resendInvitation(input.invitationId);
}

/**
 * Public invitation-token lookup. Never trusts a studio_id from the request.
 * Live path: service-key read after hashing the token; studio comes from the invitation row.
 */
export async function loadJoinSessionPrivileged(input: { token: string; studioId?: string }) {
  if (isMockOnboarding()) {
    // Mock: hashed token verified inside loadJoinSession; forged studioId is ignored.
    void input.studioId;
    return loadJoinSession(input.token);
  }

  const hash = await sha256Hex(input.token);
  // Service-key invitation lookup by token_hash — public route; identity is the hashed token, not requireStudioRole.
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("invitation")
    .select("id, studio_id, status")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data || data.status === "revoked") {
    return {
      state: "unavailable" as const,
      message: "This link has expired. Ask your teacher to send a new one.",
    };
  }
  // studio_id from the invitation row only; request body studioId is never used.
  // 0006: a paused or unpaid studio cannot take on new families.
  const { level } = await getStudioAccess(data.studio_id as string);
  if (level !== "full") {
    return {
      state: "unavailable" as const,
      message: "This studio isn't accepting new families right now. Please contact your teacher.",
    };
  }
  void input.studioId;
  return loadJoinSession(input.token);
}

export const createInvitationFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      familyId: string;
      studentIds: string[];
      enrolmentDraftIds?: string[];
      actorUserId?: string;
      studioId?: string;
    }) => data,
  )
  .handler(({ data }) => {
    if (data.actorUserId) {
      return createInvitationPrivileged({
        actorUserId: data.actorUserId,
        familyId: data.familyId,
        studentIds: data.studentIds,
        enrolmentDraftIds: data.enrolmentDraftIds,
        studioId: data.studioId,
      });
    }
    return createInvitation(data);
  });

export const resendInvitationFn = createServerFn({ method: "POST" })
  .validator((data: { invitationId: string; actorUserId?: string; studioId?: string }) => data)
  .handler(({ data }) => {
    if (data.actorUserId) {
      return resendInvitationPrivileged(
        data as { actorUserId: string; invitationId: string; studioId?: string },
      );
    }
    return resendInvitation(data.invitationId);
  });

export const loadJoinSessionFn = createServerFn({ method: "GET" })
  .validator((data: { token: string; studioId?: string }) => data)
  .handler(({ data }) => loadJoinSessionPrivileged(data));

export const unlockJoinSessionFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; turnstileToken?: string; studioId?: string }) => data)
  .handler(({ data }) => {
    // Public token route — studioId from body is ignored; unlock derives studio from the invite.
    void data.studioId;
    return unlockJoinSession(data);
  });

export const autosaveJoinAnswersFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof autosaveJoinAnswers>[0] & { studioId?: string }) => data)
  .handler(({ data }) => {
    void data.studioId;
    return autosaveJoinAnswers(data);
  });

export const submitJoinEnrolmentFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof submitJoinEnrolment>[0] & { studioId?: string }) => data)
  .handler(({ data }) => {
    void data.studioId;
    return submitJoinEnrolment(data);
  });

export const requestFamilyMagicLinkFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; turnstileToken?: string; studioId?: string }) => data)
  .handler(({ data }) => {
    void data.studioId;
    return requestFamilyMagicLink(data);
  });

export const runInviteRemindersFn = createServerFn({ method: "POST" }).handler(() =>
  runInviteReminders(),
);
