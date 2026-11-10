import { createServerFn } from "@tanstack/react-start";
import { getServerEnv, isMockOnboarding } from "./env";
import { requirePlatformAdmin } from "./authz";
import { verifyAccessToken } from "./session";
import { createServiceSupabase } from "./supabase";
import { writePlatformAudit } from "./account";
import { checkAdminActionRate } from "./rate-limit";
import { ProblemError, forbidden } from "./problem";
import { getEmailProvider } from "./email";
import { ownerWelcomeEmail } from "./email/templates/owner-welcome";
import { maskEmail } from "@/lib/auth-paths";
import { getSubscriptionStore } from "./subscription-store";
import { accessLevel, statusLabel } from "@/lib/subscription";
import { applyStudioAccessUpdate } from "./subscription";

const AU_TIMEZONES = [
  "Australia/Melbourne",
  "Australia/Sydney",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Perth",
  "Australia/Hobart",
  "Australia/Darwin",
  "Australia/Lord_Howe",
  "Australia/Broken_Hill",
  "Australia/Eucla",
  "Australia/Lindeman",
  "Australia/Currie",
] as const;

function assertAdminRate(ip?: string) {
  if (ip && !checkAdminActionRate(ip)) {
    throw new ProblemError(429, "Too many requests", "Try again in a minute.");
  }
}

/** PostgREST embedded count: `studio_member(count)` comes back as `[{ count: n }]`. */
function memberCount(embedded: unknown): number {
  if (Array.isArray(embedded)) return Number(embedded[0]?.count ?? 0);
  return 0;
}

/** Looks up auth emails for several users in parallel (the Admin API has no batch get). */
async function ownerEmailsById(
  supabase: ReturnType<typeof createServiceSupabase>,
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  const found = await Promise.all(
    unique.map(async (id) => {
      const { data } = await supabase.auth.admin.getUserById(id);
      return [id, data.user?.email ?? null] as const;
    }),
  );
  const result = new Map<string, string>();
  for (const [id, email] of found) if (email) result.set(id, email);
  return result;
}

async function gateAdmin(accessToken: string, ip?: string) {
  assertAdminRate(ip);
  const session = await verifyAccessToken(accessToken);
  // requirePlatformAdmin guards every service-key call below.
  await requirePlatformAdmin(session.userId, { aal: session.aal });
  return session;
}

export const listStudiosFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; ip?: string }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding()) return { studios: [] as const, mock: true as const };
    const session = await gateAdmin(data.accessToken, data.ip);
    void session;
    // Service-key studio list — guarded by requirePlatformAdmin above.
    const supabase = createServiceSupabase();
    // Member counts come back embedded in the same query (studio_member has a FK to studio).
    const { data: studios, error } = await supabase
      .from("studio")
      .select("id, name, created_at, owner_user_id, timezone, studio_member(count)")
      .order("created_at", { ascending: false });
    if (error) throw new ProblemError(500, "Studio list failed", error.message);

    // Subscriptions in one read and owner emails in parallel, instead of three sequential
    // round trips per studio.
    const list = studios ?? [];
    const ownerIds = [
      ...new Set(list.map((studio) => studio.owner_user_id as string | null).filter(Boolean)),
    ] as string[];
    const [subscriptions, ownerEmails] = await Promise.all([
      getSubscriptionStore().getMany(list.map((studio) => studio.id as string)),
      ownerEmailsById(supabase, ownerIds),
    ]);

    const rows = list.map((studio) => {
      const ownerEmail = studio.owner_user_id
        ? (ownerEmails.get(studio.owner_user_id as string) ?? null)
        : null;
      const subscription = subscriptions.get(studio.id as string) ?? null;
      return {
        id: studio.id as string,
        name: studio.name as string,
        createdAt: studio.created_at as string,
        timezone: studio.timezone as string,
        memberCount: memberCount(studio.studio_member),
        ownerEmailMasked: ownerEmail ? maskEmail(ownerEmail) : "—",
        status: subscription ? statusLabel(subscription.status) : "No subscription row",
        subscriptionStatus: subscription?.status ?? null,
        plan: subscription?.plan ?? null,
        accessEndsAt: subscription?.accessEndsAt ?? null,
        disputeHold: subscription?.disputeHold ?? false,
        access: accessLevel(subscription),
        paidThroughStripe: Boolean(subscription?.stripeSubscriptionId),
      };
    });
    return { studios: rows, mock: false as const };
  });

export type StartingAccess = {
  status: "pilot" | "comp" | "none";
  plan: "base" | "pro";
  /** yyyy-mm-dd, last day of free access. Required for a pilot; optional for complimentary. */
  accessEndsOn?: string | null;
};

/** Defaults to complimentary Pro, so a studio made from the console can be used straight away. */
export function validateStartingAccess(
  input: StartingAccess | undefined,
): Required<StartingAccess> {
  const status = input?.status ?? "comp";
  const plan = input?.plan ?? "pro";
  const accessEndsOn = input?.accessEndsOn?.trim() || null;
  if (!["pilot", "comp", "none"].includes(status)) throw new ProblemError(400, "Invalid access");
  if (plan !== "base" && plan !== "pro") throw new ProblemError(400, "Invalid plan");
  if (accessEndsOn && !/^\d{4}-\d{2}-\d{2}$/.test(accessEndsOn))
    throw new ProblemError(400, "Invalid date", "Use yyyy-mm-dd.");
  if (status === "pilot" && !accessEndsOn)
    throw new ProblemError(
      400,
      "Pilot end date needed",
      "A pilot needs the last day of free access (Order Form).",
    );
  return { status, plan, accessEndsOn };
}

export const createStudioFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      accessToken: string;
      name: string;
      timezone: string;
      ownerName: string;
      ownerEmail: string;
      /**
       * Free access the studio starts with. Without it a new studio has no subscription yet
       * ("incomplete"), which is owner read-only, so the owner would see the paused banner.
       */
      startingAccess?: StartingAccess;
      ip?: string;
      userAgent?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (isMockOnboarding()) {
      throw new ProblemError(400, "Mock mode", "Admin console needs live mode.");
    }
    const starting = validateStartingAccess(data.startingAccess);
    const session = await gateAdmin(data.accessToken, data.ip);
    const name = data.name.trim();
    const ownerName = data.ownerName.trim();
    const ownerEmail = data.ownerEmail.trim().toLowerCase();
    const timezone = data.timezone.trim();
    if (!name || !ownerName || !ownerEmail) {
      throw new ProblemError(
        400,
        "Invalid input",
        "Name, owner name and owner email are required.",
      );
    }
    if (!(AU_TIMEZONES as readonly string[]).includes(timezone)) {
      throw new ProblemError(400, "Invalid timezone", "Choose an Australian timezone.");
    }

    // Service-key auth admin — guarded by requirePlatformAdmin.
    const supabase = createServiceSupabase();
    const env = getServerEnv();

    let ownerUserId: string | null = null;
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = listed.data.users.find((user) => user.email?.toLowerCase() === ownerEmail);
    if (existing) {
      ownerUserId = existing.id;
    } else {
      const invited = await supabase.auth.admin.inviteUserByEmail(ownerEmail, {
        redirectTo: `${env.appUrl}/auth/callback`,
        data: { display_name: ownerName },
      });
      if (invited.error || !invited.data.user) {
        throw new ProblemError(
          500,
          "Owner invite failed",
          invited.error?.message ?? "Could not invite owner.",
        );
      }
      ownerUserId = invited.data.user.id;
    }

    // Service-key RPC create_studio_with_owner — guarded by requirePlatformAdmin.
    const { data: studioId, error: rpcError } = await supabase.rpc("create_studio_with_owner", {
      p_name: name,
      p_timezone: timezone,
      p_owner_user_id: ownerUserId,
      p_actor: session.userId,
    });
    if (rpcError || !studioId) {
      throw new ProblemError(
        500,
        "Studio create failed",
        rpcError?.message ?? "create_studio_with_owner returned no id",
      );
    }
    const resolvedStudioId = studioId as string;

    if (starting.status !== "none") {
      // requirePlatformAdmin (gateAdmin above) guards this service-key write.
      const saved = await applyStudioAccessUpdate(resolvedStudioId, {
        status: starting.status,
        plan: starting.plan,
        accessEndsOn: starting.accessEndsOn,
        note:
          starting.status === "pilot"
            ? "Pilot access set when the studio was created"
            : "Complimentary access set when the studio was created",
      });
      await writePlatformAudit({
        actorUserId: session.userId,
        event: "studio_access_changed",
        targetStudioId: resolvedStudioId,
        detail: {
          status: saved.status,
          plan: saved.plan,
          access_ends_at: saved.accessEndsAt,
          at_creation: true,
        },
        ...(data.ip ? { ip: data.ip } : {}),
      });
    }

    await writePlatformAudit({
      actorUserId: session.userId,
      event: "owner_invited",
      targetStudioId: resolvedStudioId,
      targetUserId: ownerUserId,
      detail: { email_domain: ownerEmail.split("@")[1] },
      ip: data.ip,
      userAgent: data.userAgent,
    });

    const mail = ownerWelcomeEmail({
      ownerName,
      studioName: name,
      signInUrl: `${env.appUrl}/login`,
    });
    // The studio and the Supabase sign-in invite already exist at this point, so a
    // failed welcome email must not surface as a failed create (a retry would make
    // a duplicate studio).
    let welcomeEmailError: string | null = null;
    try {
      await getEmailProvider().send({
        to: ownerEmail,
        from: env.emailFrom,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tags: [{ name: "kind", value: "owner_welcome" }],
      });
    } catch (err) {
      welcomeEmailError = err instanceof Error ? err.message : "Welcome email failed";
      console.error("[platform] owner welcome email failed", welcomeEmailError);
    }

    return {
      studioId: resolvedStudioId,
      inviteSentTo: maskEmail(ownerEmail),
      welcomeEmailError,
    };
  });

export const listPlatformStaffFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; ip?: string }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding()) return { staff: [] as const, mock: true as const };
    await gateAdmin(data.accessToken, data.ip);
    // Service-key platform_staff list — guarded by requirePlatformAdmin.
    const supabase = createServiceSupabase();
    const { data: rows, error } = await supabase
      .from("platform_staff")
      .select("user_id, role, display_name, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new ProblemError(500, "Staff list failed", error.message);

    const emails = await ownerEmailsById(
      supabase,
      (rows ?? []).map((row) => row.user_id as string),
    );
    const staff = (rows ?? []).map((row) => {
      const email = emails.get(row.user_id as string);
      return {
        userId: row.user_id as string,
        role: row.role as string,
        displayName: row.display_name as string,
        createdAt: row.created_at as string,
        emailMasked: email ? maskEmail(email) : "—",
      };
    });
    return { staff, mock: false as const };
  });

export const addPlatformStaffFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      accessToken: string;
      email: string;
      displayName: string;
      role: "platform_admin" | "support";
      ip?: string;
      userAgent?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (isMockOnboarding())
      throw new ProblemError(400, "Mock mode", "Admin console needs live mode.");
    const session = await gateAdmin(data.accessToken, data.ip);
    const email = data.email.trim().toLowerCase();
    const displayName = data.displayName.trim();
    if (!email || !displayName)
      throw new ProblemError(400, "Invalid input", "Email and name required.");

    // Service-key auth + platform_staff write — guarded by requirePlatformAdmin.
    const supabase = createServiceSupabase();
    const env = getServerEnv();
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    let user = listed.data.users.find((entry) => entry.email?.toLowerCase() === email);
    if (!user) {
      const invited = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${env.appUrl}/auth/callback`,
        data: { display_name: displayName },
      });
      if (invited.error || !invited.data.user) {
        throw new ProblemError(500, "Invite failed", invited.error?.message ?? "Invite failed");
      }
      user = invited.data.user;
    }

    const { error } = await supabase.from("platform_staff").upsert({
      user_id: user.id,
      role: data.role,
      display_name: displayName,
      created_by: session.userId,
    });
    if (error) throw new ProblemError(500, "Staff add failed", error.message);

    await writePlatformAudit({
      actorUserId: session.userId,
      event: "staff_added",
      targetUserId: user.id,
      detail: { role: data.role },
      ip: data.ip,
      userAgent: data.userAgent,
    });
    return { ok: true as const, emailMasked: maskEmail(email) };
  });

export const removePlatformStaffFn = createServerFn({ method: "POST" })
  .validator(
    (data: { accessToken: string; targetUserId: string; ip?: string; userAgent?: string }) => data,
  )
  .handler(async ({ data }) => {
    if (isMockOnboarding())
      throw new ProblemError(400, "Mock mode", "Admin console needs live mode.");
    const session = await gateAdmin(data.accessToken, data.ip);
    if (data.targetUserId === session.userId) {
      throw forbidden("You cannot remove yourself.");
    }
    // Service-key platform_staff mutate — guarded by requirePlatformAdmin.
    const supabase = createServiceSupabase();
    const { data: target } = await supabase
      .from("platform_staff")
      .select("role")
      .eq("user_id", data.targetUserId)
      .maybeSingle();
    if (!target) throw new ProblemError(404, "Not found", "Staff member not found.");
    if (target.role === "platform_admin") {
      const { count } = await supabase
        .from("platform_staff")
        .select("*", { count: "exact", head: true })
        .eq("role", "platform_admin");
      if ((count ?? 0) <= 1) {
        throw forbidden("Cannot remove the last platform admin.");
      }
    }
    const { error } = await supabase
      .from("platform_staff")
      .delete()
      .eq("user_id", data.targetUserId);
    if (error) throw new ProblemError(500, "Staff remove failed", error.message);
    await writePlatformAudit({
      actorUserId: session.userId,
      event: "staff_removed",
      targetUserId: data.targetUserId,
      ip: data.ip,
      userAgent: data.userAgent,
    });
    return { ok: true as const };
  });

export const resetMfaFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      accessToken: string;
      targetUserId: string;
      confirmEmail: string;
      ip?: string;
      userAgent?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (isMockOnboarding())
      throw new ProblemError(400, "Mock mode", "Admin console needs live mode.");
    const session = await gateAdmin(data.accessToken, data.ip);
    // Service-key MFA factor delete — guarded by requirePlatformAdmin.
    const supabase = createServiceSupabase();
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      data.targetUserId,
    );
    if (userError || !userData.user) {
      throw new ProblemError(404, "Not found", "User not found.");
    }
    const email = userData.user.email?.toLowerCase() ?? "";
    if (email !== data.confirmEmail.trim().toLowerCase()) {
      throw new ProblemError(400, "Confirmation failed", "Type the user's email to confirm.");
    }

    const factors = await supabase.auth.admin.mfa.listFactors({ userId: data.targetUserId });
    for (const factor of factors.data?.factors ?? []) {
      await supabase.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: data.targetUserId,
      });
    }
    await supabase.auth.admin.signOut(data.targetUserId, "global");
    await writePlatformAudit({
      actorUserId: session.userId,
      event: "mfa_reset",
      targetUserId: data.targetUserId,
      ip: data.ip,
      userAgent: data.userAgent,
    });
    return { ok: true as const };
  });

export const listPlatformAuditFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      accessToken: string;
      event?: string;
      from?: string;
      to?: string;
      page?: number;
      ip?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (isMockOnboarding()) return { rows: [] as const, mock: true as const };
    await gateAdmin(data.accessToken, data.ip);
    // Service-key platform_audit read — guarded by requirePlatformAdmin.
    const supabase = createServiceSupabase();
    const page = Math.max(1, data.page ?? 1);
    const pageSize = 50;
    let query = supabase
      .from("platform_audit")
      .select("id, actor_user_id, event, target_studio_id, target_user_id, detail, at")
      .order("at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (data.event) query = query.eq("event", data.event);
    if (data.from) query = query.gte("at", data.from);
    if (data.to) query = query.lte("at", data.to);
    const { data: rows, error } = await query;
    if (error) throw new ProblemError(500, "Audit list failed", error.message);
    return { rows: rows ?? [], mock: false as const, page, pageSize };
  });

export const getSupportEmailFn = createServerFn({ method: "GET" }).handler(() => {
  return { email: getServerEnv().supportEmail };
});

export { AU_TIMEZONES };
