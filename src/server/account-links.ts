/**
 * Account status ("Active" once someone has signed in) and "Send sign-in link" for platform
 * staff, studio owners and families. A first invite link expires after about an hour, so
 * admins and teachers can send a fresh one themselves instead of going to Supabase.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, isMockOnboarding } from "./env";
import { requirePlatformAdmin, requireRecentMfa, requireStudioRole } from "./authz";
import { revokeAllTrustedDevices } from "./trusted-device";
import { verifyAccessToken } from "./session";
import { createServiceSupabase } from "./supabase";
import { writeAuthAudit, writePlatformAudit } from "./account";
import { checkAdminActionRate } from "./rate-limit";
import { ProblemError } from "./problem";
import { getEmailProvider } from "./email";
import { fromLine } from "./billing-email";
import { signInLinkEmail, type SignInLinkAudience } from "./email/templates/sign-in-link";
import { maskEmail } from "@/lib/auth-paths";

export type AccountState = "active" | "not_signed_in" | "no_account" | "revoked";

export type AccountStatus = {
  state: AccountState;
  /** Last sign-in, when active. */
  lastSignInAt: string | null;
  /** When the first invite went out, if Supabase recorded it. */
  invitedAt: string | null;
};

type AuthUserLike = {
  email?: string | null;
  last_sign_in_at?: string | null;
  invited_at?: string | null;
  confirmation_sent_at?: string | null;
  banned_until?: string | null;
};

/** A Supabase Auth ban in the future means Keystone revoked this person's access. */
export function isBanned(
  user: { banned_until?: string | null } | null | undefined,
  now = Date.now(),
) {
  if (!user?.banned_until) return false;
  const until = Date.parse(user.banned_until);
  return Number.isFinite(until) && until > now;
}

/** Active means the person has finished a sign-in at least once. */
export function accountStatusFor(user: AuthUserLike | null | undefined): AccountStatus {
  if (!user) return { state: "no_account", lastSignInAt: null, invitedAt: null };
  if (isBanned(user)) {
    return {
      state: "revoked",
      lastSignInAt: user.last_sign_in_at ?? null,
      invitedAt: user.invited_at ?? null,
    };
  }
  if (user.last_sign_in_at) {
    return {
      state: "active",
      lastSignInAt: user.last_sign_in_at,
      invitedAt: user.invited_at ?? null,
    };
  }
  return {
    state: "not_signed_in",
    lastSignInAt: null,
    invitedAt: user.invited_at ?? user.confirmation_sent_at ?? null,
  };
}

/** Auth users by id, in parallel (the Admin API has no batch get). */
export async function authUsersById(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, AuthUserLike & { email: string | null }>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const found = await Promise.all(
    unique.map(async (id) => {
      const { data } = await supabase.auth.admin.getUserById(id);
      return [id, data.user ?? null] as const;
    }),
  );
  const result = new Map<string, AuthUserLike & { email: string | null }>();
  for (const [id, user] of found) {
    if (user) {
      result.set(id, {
        email: user.email ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        invited_at: user.invited_at ?? null,
        confirmation_sent_at: user.confirmation_sent_at ?? null,
        banned_until: (user as { banned_until?: string | null }).banned_until ?? null,
      });
    }
  }
  return result;
}

/**
 * Finds a sign-in account by email. The Admin API has no lookup by email, and every parent who
 * finishes an enrolment form gets an account, so only reading the first page (as before) would
 * stop finding existing people once there are more than a page of accounts.
 */
export async function findAuthUserByEmail(supabase: SupabaseClient, email: string) {
  const wanted = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new ProblemError(500, "Account lookup failed", error.message);
    const users = data?.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === wanted);
    if (found) return found;
    if (users.length < perPage) return null;
  }
  return null;
}

/** One link per person per minute, so a double press doesn't send two emails. */
const recentSends = new Map<string, number>();
export function allowLinkSend(key: string, now = Date.now()): boolean {
  const last = recentSends.get(key);
  if (last !== undefined && now - last < 60_000) return false;
  recentSends.set(key, now);
  return true;
}
export function resetLinkSendsForTests() {
  recentSends.clear();
}

/**
 * Makes a one-time sign-in link and emails it. A magic link also confirms an invited user
 * who never accepted, so the same link works for "never signed in" and "lost the email".
 */
export async function sendSignInLink(
  supabase: SupabaseClient,
  input: {
    userId: string;
    name: string;
    audience: SignInLinkAudience;
    studioName?: string | undefined;
  },
): Promise<{ emailMasked: string }> {
  const env = getServerEnv();
  const { data: found, error: userError } = await supabase.auth.admin.getUserById(input.userId);
  const user = found.user;
  if (userError || !user?.email) {
    throw new ProblemError(404, "No sign-in account", "This person has no sign-in account yet.");
  }
  if (isBanned(user as { banned_until?: string | null })) {
    throw new ProblemError(
      409,
      "Access revoked",
      "Restore this person's access before sending a link.",
    );
  }
  const email = user.email;
  let link = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (!link.data?.properties?.hashed_token && !user.email_confirmed_at) {
    // An invited user who never accepted: fall back to a fresh invite link.
    link = await supabase.auth.admin.generateLink({ type: "invite", email });
  }
  const tokenHash = link.data?.properties?.hashed_token;
  const linkType = link.data?.properties?.verification_type ?? "magiclink";
  if (!tokenHash) {
    throw new ProblemError(
      500,
      "Link not created",
      link.error?.message ?? "Could not create a link.",
    );
  }
  const mail = signInLinkEmail({
    audience: input.audience,
    name: input.name,
    studioName: input.studioName,
    signInUrl: `${env.appUrl}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(linkType)}`,
    loginUrl: `${env.appUrl}/login`,
    hasSignedIn: Boolean(user.last_sign_in_at),
  });
  await getEmailProvider().send({
    to: email,
    from:
      input.audience === "family" && input.studioName
        ? fromLine(input.studioName, env.emailFrom)
        : env.emailFrom,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tags: [{ name: "kind", value: `sign_in_link_${input.audience}` }],
  });
  return { emailMasked: maskEmail(email) };
}

/** Revoke/restore also need the authenticator code from the last 10 minutes. */
async function gateAdminSensitive(accessToken: string, ip?: string) {
  const session = await gateAdmin(accessToken, ip);
  requireRecentMfa(session);
  return session;
}

async function gateAdmin(accessToken: string, ip?: string) {
  if (ip && !checkAdminActionRate(ip)) {
    throw new ProblemError(429, "Too many requests", "Try again in a minute.");
  }
  const session = await verifyAccessToken(accessToken);
  await requirePlatformAdmin(session.userId, { aal: session.aal });
  return session;
}

function tooSoon(): never {
  throw new ProblemError(429, "Link just sent", "A link was sent less than a minute ago.");
}

/** /admin Team: send a platform staff member a fresh sign-in link. */
export const sendStaffSignInLinkFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; targetUserId: string; ip?: string }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding())
      throw new ProblemError(400, "Mock mode", "Admin console needs live mode.");
    const session = await gateAdmin(data.accessToken, data.ip);
    // Service-key reads and auth admin calls below — guarded by requirePlatformAdmin.
    const supabase = createServiceSupabase();
    const { data: row, error } = await supabase
      .from("platform_staff")
      .select("user_id, display_name")
      .eq("user_id", data.targetUserId)
      .maybeSingle();
    if (error) throw new ProblemError(500, "Staff lookup failed", error.message);
    if (!row) throw new ProblemError(404, "Not team staff", "That person isn't on the team.");
    if (!allowLinkSend(`staff:${data.targetUserId}`)) tooSoon();
    const sent = await sendSignInLink(supabase, {
      userId: data.targetUserId,
      name: row.display_name as string,
      audience: "staff",
    });
    // Reuses the staff_added event (no migration): detail.link_resent marks a fresh link.
    await writePlatformAudit({
      actorUserId: session.userId,
      event: "staff_added",
      targetUserId: data.targetUserId,
      detail: { link_resent: true },
      ip: data.ip,
    });
    return sent;
  });

/** /admin Studios: send a studio owner a fresh sign-in link. */
export const sendOwnerSignInLinkFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; studioId: string; ip?: string }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding())
      throw new ProblemError(400, "Mock mode", "Admin console needs live mode.");
    const session = await gateAdmin(data.accessToken, data.ip);
    // Service-key reads and auth admin calls below — guarded by requirePlatformAdmin.
    const supabase = createServiceSupabase();
    const { data: studio, error } = await supabase
      .from("studio")
      .select("id, name, owner_user_id")
      .eq("id", data.studioId)
      .maybeSingle();
    if (error) throw new ProblemError(500, "Studio lookup failed", error.message);
    const ownerId = studio?.owner_user_id as string | null | undefined;
    if (!studio || !ownerId)
      throw new ProblemError(404, "No owner", "This studio has no owner account.");
    if (!allowLinkSend(`owner:${ownerId}`)) tooSoon();
    const { data: meta } = await supabase.auth.admin.getUserById(ownerId);
    const name = (meta.user?.user_metadata?.["display_name"] as string | undefined) ?? "there";
    const sent = await sendSignInLink(supabase, {
      userId: ownerId,
      name,
      audience: "owner",
      studioName: studio.name as string,
    });
    // Reuses the owner_invited event (no migration): detail.link_resent marks a fresh link.
    await writePlatformAudit({
      actorUserId: session.userId,
      event: "owner_invited",
      targetStudioId: data.studioId,
      targetUserId: ownerId,
      detail: { link_resent: true },
      ip: data.ip,
    });
    return sent;
  });

type GuardianRow = {
  id: string;
  user_id: string | null;
  revoked_user_id?: string | null;
  access_revoked_at?: string | null;
  full_name: string;
  family: { studio_id: string } | { studio_id: string }[] | null;
};

function guardianStudioId(row: GuardianRow): string | null {
  const family = Array.isArray(row.family) ? row.family[0] : row.family;
  return family?.studio_id ?? null;
}

/** Student profile: sign-in status for each guardian of a family in the teacher's studio. */
export const listGuardianAccountsFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; studioId: string; familyId: string }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding()) return { guardians: [] as GuardianAccount[] };
    const session = await verifyAccessToken(data.accessToken);
    await requireStudioRole(session.userId, data.studioId, ["owner", "admin", "teacher"], {
      aal: session.aal,
      access: "read",
    });
    // Service-key read — guarded by requireStudioRole and the studio_id match below.
    const supabase = createServiceSupabase();
    const { data: rows, error } = await selectGuardians(supabase, "family_id", data.familyId);
    if (error) throw new ProblemError(500, "Guardian lookup failed", error.message);
    const own = ((rows ?? []) as GuardianRow[]).filter(
      (row) => guardianStudioId(row) === data.studioId,
    );
    const users = await authUsersById(
      supabase,
      own.map((row) => row.user_id).filter((id): id is string => Boolean(id)),
    );
    const guardians: GuardianAccount[] = own.map((row) =>
      !row.user_id && row.revoked_user_id
        ? {
            guardianId: row.id,
            state: "revoked",
            lastSignInAt: null,
            invitedAt: null,
            revokedAt: row.access_revoked_at ?? null,
          }
        : {
            guardianId: row.id,
            ...accountStatusFor(row.user_id ? users.get(row.user_id) : null),
          },
    );
    return { guardians };
  });

export type GuardianAccount = AccountStatus & { guardianId: string; revokedAt?: string | null };

const GUARDIAN_COLUMNS = "id, user_id, full_name, family:family_id(studio_id)";

/** Reads guardians with the 0020 revoke columns, or without them if 0020 isn't applied yet. */
async function selectGuardians(
  supabase: SupabaseClient,
  column: "id" | "family_id",
  value: string,
) {
  const withRevoke = await supabase
    .from("guardian")
    .select(`${GUARDIAN_COLUMNS}, revoked_user_id, access_revoked_at`)
    .eq(column, value);
  if (!withRevoke.error) return withRevoke;
  return supabase.from("guardian").select(GUARDIAN_COLUMNS).eq(column, value);
}

/** Student profile: send a guardian a fresh sign-in link to the family app. */
export const sendGuardianSignInLinkFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; studioId: string; guardianId: string }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding()) throw new ProblemError(400, "Mock mode", "Needs a real studio.");
    const session = await verifyAccessToken(data.accessToken);
    await requireStudioRole(session.userId, data.studioId, ["owner", "admin", "teacher"], {
      aal: session.aal,
    });
    // Service-key reads and auth admin calls below — guarded by requireStudioRole and the
    // check that the guardian's family belongs to this studio.
    const supabase = createServiceSupabase();
    const guardian = await guardianInStudio(supabase, data.guardianId, data.studioId);
    if (!guardian.user_id && guardian.revoked_user_id) {
      throw new ProblemError(
        409,
        "Access revoked",
        "Restore this parent's access before sending a link.",
      );
    }
    if (!guardian.user_id) {
      throw new ProblemError(
        409,
        "Enrolment form not finished",
        "This parent hasn't finished the enrolment form yet. Resend the invite from Students, then Enrol.",
      );
    }
    if (!allowLinkSend(`guardian:${guardian.id}`)) tooSoon();
    const { data: studio } = await supabase
      .from("studio")
      .select("name")
      .eq("id", data.studioId)
      .maybeSingle();
    const sent = await sendSignInLink(supabase, {
      userId: guardian.user_id,
      name: guardian.full_name,
      audience: "family",
      studioName: (studio?.name as string | undefined) ?? undefined,
    });
    await writeAuthAudit({
      studioId: data.studioId,
      actorUserId: session.userId,
      guardianId: guardian.id,
      event: "magic_link_requested",
    });
    return sent;
  });

async function guardianInStudio(
  supabase: SupabaseClient,
  guardianId: string,
  studioId: string,
): Promise<GuardianRow> {
  const { data: rows, error } = await selectGuardians(supabase, "id", guardianId);
  if (error) throw new ProblemError(500, "Guardian lookup failed", error.message);
  const guardian = ((rows ?? []) as GuardianRow[])[0];
  if (!guardian || guardianStudioId(guardian) !== studioId) {
    throw new ProblemError(404, "Not found", "That parent isn't in this studio.");
  }
  return guardian;
}

/** About 100 years: Supabase Auth has no "forever" ban. Restore sets it back to none. */
const BAN_FOREVER = "876000h";

async function setBanned(supabase: SupabaseClient, userId: string, banned: boolean) {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: banned ? BAN_FOREVER : "none",
  });
  if (error) throw new ProblemError(500, "Access change failed", error.message);
}

/**
 * /admin Team: revoke or restore a staff member's access. Revoking bans their sign-in (no new
 * sign-in or session refresh) and every server action checks the ban, so it applies at once.
 */
export const setStaffAccessFn = createServerFn({ method: "POST" })
  .validator(
    (data: { accessToken: string; targetUserId: string; revoke: boolean; ip?: string }) => data,
  )
  .handler(async ({ data }) => {
    if (isMockOnboarding())
      throw new ProblemError(400, "Mock mode", "Admin console needs live mode.");
    const session = await gateAdminSensitive(data.accessToken, data.ip);
    if (data.revoke && data.targetUserId === session.userId) {
      throw new ProblemError(403, "Not allowed", "You can't revoke your own access.");
    }
    // Service-key reads and auth admin calls below — guarded by requirePlatformAdmin.
    const supabase = createServiceSupabase();
    const { data: row, error } = await supabase
      .from("platform_staff")
      .select("user_id")
      .eq("user_id", data.targetUserId)
      .maybeSingle();
    if (error) throw new ProblemError(500, "Staff lookup failed", error.message);
    if (!row) throw new ProblemError(404, "Not team staff", "That person isn't on the team.");
    await setBanned(supabase, data.targetUserId, data.revoke);
    if (data.revoke) await revokeAllTrustedDevices(data.targetUserId);
    await writePlatformAudit({
      actorUserId: session.userId,
      event: data.revoke ? "access_revoked" : "access_restored",
      targetUserId: data.targetUserId,
      detail: { who: "staff" },
      ip: data.ip,
    });
    return { ok: true as const };
  });

/** /admin Studios: revoke or restore a studio owner's access (their sign-in, everywhere). */
export const setOwnerAccessFn = createServerFn({ method: "POST" })
  .validator(
    (data: { accessToken: string; studioId: string; revoke: boolean; ip?: string }) => data,
  )
  .handler(async ({ data }) => {
    if (isMockOnboarding())
      throw new ProblemError(400, "Mock mode", "Admin console needs live mode.");
    const session = await gateAdminSensitive(data.accessToken, data.ip);
    // Service-key reads and auth admin calls below — guarded by requirePlatformAdmin.
    const supabase = createServiceSupabase();
    const { data: studio, error } = await supabase
      .from("studio")
      .select("id, owner_user_id")
      .eq("id", data.studioId)
      .maybeSingle();
    if (error) throw new ProblemError(500, "Studio lookup failed", error.message);
    const ownerId = studio?.owner_user_id as string | null | undefined;
    if (!studio || !ownerId)
      throw new ProblemError(404, "No owner", "This studio has no owner account.");
    if (data.revoke && ownerId === session.userId) {
      throw new ProblemError(403, "Not allowed", "You can't revoke your own access.");
    }
    await setBanned(supabase, ownerId, data.revoke);
    if (data.revoke) await revokeAllTrustedDevices(ownerId);
    await writePlatformAudit({
      actorUserId: session.userId,
      event: data.revoke ? "access_revoked" : "access_restored",
      targetStudioId: data.studioId,
      targetUserId: ownerId,
      detail: { who: "owner" },
      ip: data.ip,
    });
    return { ok: true as const };
  });

/**
 * Student profile: revoke or restore one parent's access to this studio's family app. Only
 * this studio: the sign-in itself stays, so a parent with another studio keeps that one.
 * Moving user_id aside makes every guardian RLS policy stop matching straight away.
 */
export const setGuardianAccessFn = createServerFn({ method: "POST" })
  .validator(
    (data: { accessToken: string; studioId: string; guardianId: string; revoke: boolean }) => data,
  )
  .handler(async ({ data }) => {
    if (isMockOnboarding()) throw new ProblemError(400, "Mock mode", "Needs a real studio.");
    const session = await verifyAccessToken(data.accessToken);
    await requireStudioRole(session.userId, data.studioId, ["owner", "admin"], {
      aal: session.aal,
    });
    if (data.revoke) requireRecentMfa(session);
    // Service-key reads and writes below — guarded by requireStudioRole and the check that the
    // guardian's family belongs to this studio.
    const supabase = createServiceSupabase();
    const guardian = await guardianInStudio(supabase, data.guardianId, data.studioId);
    if (!("revoked_user_id" in guardian)) {
      throw new ProblemError(
        503,
        "Not set up yet",
        "Revoking parent access needs database update 0020. Ask Keystone support.",
      );
    }
    if (data.revoke) {
      if (!guardian.user_id) {
        throw new ProblemError(409, "Nothing to revoke", "This parent has no family app access.");
      }
      const { error } = await supabase
        .from("guardian")
        .update({
          revoked_user_id: guardian.user_id,
          user_id: null,
          access_revoked_at: new Date().toISOString(),
        })
        .eq("id", guardian.id);
      if (error) throw new ProblemError(500, "Revoke failed", error.message);
      // Their browsers stop being trusted too (they keep any other studio, after signing in).
      await revokeAllTrustedDevices(guardian.user_id);
    } else {
      if (!guardian.revoked_user_id) {
        throw new ProblemError(409, "Not revoked", "This parent's access isn't revoked.");
      }
      const { error } = await supabase
        .from("guardian")
        .update({
          user_id: guardian.revoked_user_id,
          revoked_user_id: null,
          access_revoked_at: null,
        })
        .eq("id", guardian.id);
      if (error) throw new ProblemError(500, "Restore failed", error.message);
    }
    await writeAuthAudit({
      studioId: data.studioId,
      actorUserId: session.userId,
      guardianId: guardian.id,
      event: data.revoke ? "access_revoked" : "access_restored",
    });
    return { ok: true as const };
  });
