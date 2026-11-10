import { createServerFn } from "@tanstack/react-start";
import { createServiceSupabase } from "./supabase";
import { isMockOnboarding } from "./env";
import { verifyAccessToken } from "./session";
import { mockMemberships, mockPlatformStaff } from "./authz";
import { ProblemError } from "./problem";
import { getStudioAccess } from "./subscription-store";
import type { AccessLevel, SubscriptionPlan, SubscriptionStatus } from "@/lib/subscription";

export type StudioAccessEntry = {
  studioId: string;
  role: "owner" | "admin" | "teacher" | "guardian";
  level: AccessLevel;
  status: SubscriptionStatus | null;
  plan: SubscriptionPlan | null;
  accessEndsAt: string | null;
};

async function studioAccessFor(
  entries: Array<{ studioId: string; role: StudioAccessEntry["role"] }>,
): Promise<StudioAccessEntry[]> {
  const result: StudioAccessEntry[] = [];
  for (const entry of entries) {
    const { level, subscription } = await getStudioAccess(entry.studioId);
    result.push({
      ...entry,
      level,
      status: subscription?.status ?? null,
      plan: subscription?.plan ?? null,
      accessEndsAt: subscription?.accessEndsAt ?? null,
    });
  }
  return result;
}

export type ResolvedAccount = {
  userId: string;
  email: string | null;
  aal: string | null;
  platformStaff: { role: "platform_admin" | "support"; displayName: string } | null;
  memberships: Array<{ studioId: string; role: string }>;
  guardianFamilyIds: string[];
  /** Subscription access for each studio this person belongs to (0006). */
  studioAccess: StudioAccessEntry[];
};

export async function resolveAccountForUser(
  userId: string,
  email: string | null,
  aal: string | null,
): Promise<ResolvedAccount> {
  if (isMockOnboarding()) {
    const staff = mockPlatformStaff.find((row) => row.userId === userId) ?? null;
    const memberships = mockMemberships
      .filter((row) => row.userId === userId)
      .map((row) => ({ studioId: row.studioId, role: row.role }));
    return {
      userId,
      email,
      aal,
      platformStaff: staff ? { role: staff.role, displayName: staff.displayName } : null,
      memberships,
      guardianFamilyIds: [],
      studioAccess: await studioAccessFor(memberships),
    };
  }

  // Service-key reads — caller must have verified JWT user id (never from request body).
  const supabase = createServiceSupabase();

  const [staffRes, memberRes, guardianRes] = await Promise.all([
    supabase
      .from("platform_staff")
      .select("role, display_name")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("studio_member").select("studio_id, role").eq("user_id", userId),
    supabase.from("guardian").select("family_id").eq("user_id", userId),
  ]);

  if (staffRes.error) {
    throw new ProblemError(500, "Account lookup failed", staffRes.error.message);
  }
  if (memberRes.error) {
    throw new ProblemError(500, "Account lookup failed", memberRes.error.message);
  }
  if (guardianRes.error) {
    throw new ProblemError(500, "Account lookup failed", guardianRes.error.message);
  }

  const memberships = (memberRes.data ?? []).map((row) => ({
    studioId: row.studio_id as string,
    role: row.role as string,
  }));
  const guardianFamilyIds = (guardianRes.data ?? []).map((row) => row.family_id as string);
  const platformStaff = staffRes.data
    ? {
        role: staffRes.data.role as "platform_admin" | "support",
        displayName: staffRes.data.display_name as string,
      }
    : null;

  // Platform-only staff never hit subscription gates — skip studio access lookups.
  if (platformStaff && memberships.length === 0 && guardianFamilyIds.length === 0) {
    return {
      userId,
      email,
      aal,
      studioAccess: [],
      platformStaff,
      memberships,
      guardianFamilyIds,
    };
  }

  // Guardian families → their studios (service-key read, same verified user).
  let guardianStudios: string[] = [];
  if (guardianFamilyIds.length > 0) {
    const { data: families, error: familyError } = await supabase
      .from("family")
      .select("studio_id")
      .in("id", guardianFamilyIds);
    if (familyError) throw new ProblemError(500, "Account lookup failed", familyError.message);
    guardianStudios = [...new Set((families ?? []).map((row) => row.studio_id as string))];
  }
  const memberStudios = new Set(memberships.map((m) => m.studioId));
  const studioAccess = await studioAccessFor([
    ...memberships.map((m) => ({
      studioId: m.studioId,
      role: m.role as StudioAccessEntry["role"],
    })),
    ...guardianStudios
      .filter((studioId) => !memberStudios.has(studioId))
      .map((studioId) => ({ studioId, role: "guardian" as const })),
  ]);

  return {
    userId,
    email,
    aal,
    studioAccess,
    platformStaff,
    memberships,
    guardianFamilyIds,
  };
}

export async function writePlatformAudit(input: {
  actorUserId: string | null;
  event: string;
  targetStudioId?: string | null;
  targetUserId?: string | null;
  detail?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}) {
  if (isMockOnboarding()) return;
  // Service-key insert into platform_audit — callers must already gate with requirePlatformAdmin
  // or use this only for sign_in_no_account after JWT verification.
  const supabase = createServiceSupabase();
  await supabase.from("platform_audit").insert({
    actor_user_id: input.actorUserId,
    event: input.event,
    target_studio_id: input.targetStudioId ?? null,
    target_user_id: input.targetUserId ?? null,
    detail: input.detail ?? {},
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
  });
}

export async function writeAuthAudit(input: {
  studioId: string;
  actorUserId: string | null;
  event: "mfa_enrolled" | "sign_in";
  ip?: string;
  userAgent?: string;
}) {
  if (isMockOnboarding()) return;
  // Service-key insert into auth_audit — guarded by prior studio membership resolution.
  const supabase = createServiceSupabase();
  await supabase.from("auth_audit").insert({
    studio_id: input.studioId,
    actor_user_id: input.actorUserId,
    event: input.event,
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
  });
}

export const resolveAccountFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    const session = await verifyAccessToken(data.accessToken);
    return resolveAccountForUser(session.userId, session.email, session.aal);
  });

export const recordNoAccountFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; ip?: string; userAgent?: string }) => data)
  .handler(async ({ data }) => {
    const session = await verifyAccessToken(data.accessToken);
    await writePlatformAudit({
      actorUserId: session.userId,
      event: "sign_in_no_account",
      detail: { email_domain: session.email?.split("@")[1] ?? null },
      ip: data.ip,
      userAgent: data.userAgent,
    });
    return { ok: true as const };
  });

export const recordMfaEnrolledFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; ip?: string; userAgent?: string }) => data)
  .handler(async ({ data }) => {
    const session = await verifyAccessToken(data.accessToken);
    const account = await resolveAccountForUser(session.userId, session.email, session.aal);
    if (account.platformStaff) {
      await writePlatformAudit({
        actorUserId: session.userId,
        event: "mfa_enrolled",
        targetUserId: session.userId,
        ip: data.ip,
        userAgent: data.userAgent,
      });
    } else if (account.memberships[0]) {
      await writeAuthAudit({
        studioId: account.memberships[0].studioId,
        actorUserId: session.userId,
        event: "mfa_enrolled",
        ip: data.ip,
        userAgent: data.userAgent,
      });
    }
    return { ok: true as const };
  });
