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
    const { data: studios, error } = await supabase
      .from("studio")
      .select("id, name, created_at, owner_user_id, timezone")
      .order("created_at", { ascending: false });
    if (error) throw new ProblemError(500, "Studio list failed", error.message);

    const rows = [];
    for (const studio of studios ?? []) {
      const { count } = await supabase
        .from("studio_member")
        .select("*", { count: "exact", head: true })
        .eq("studio_id", studio.id);
      let ownerEmail: string | null = null;
      if (studio.owner_user_id) {
        const { data: user } = await supabase.auth.admin.getUserById(studio.owner_user_id);
        ownerEmail = user.user?.email ?? null;
      }
      const subscription = await getSubscriptionStore().get(studio.id as string);
      rows.push({
        id: studio.id as string,
        name: studio.name as string,
        createdAt: studio.created_at as string,
        timezone: studio.timezone as string,
        memberCount: count ?? 0,
        ownerEmailMasked: ownerEmail ? maskEmail(ownerEmail) : "—",
        status: subscription ? statusLabel(subscription.status) : "No subscription row",
        subscriptionStatus: subscription?.status ?? null,
        plan: subscription?.plan ?? null,
        accessEndsAt: subscription?.accessEndsAt ?? null,
        disputeHold: subscription?.disputeHold ?? false,
        access: accessLevel(subscription),
        paidThroughStripe: Boolean(subscription?.stripeSubscriptionId),
      });
    }
    return { studios: rows, mock: false as const };
  });

export const createStudioFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      accessToken: string;
      name: string;
      timezone: string;
      ownerName: string;
      ownerEmail: string;
      ip?: string;
      userAgent?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (isMockOnboarding()) {
      throw new ProblemError(400, "Mock mode", "Admin console needs live mode.");
    }
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
    await getEmailProvider().send({
      to: ownerEmail,
      from: env.emailFrom,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tags: [{ name: "kind", value: "owner_welcome" }],
    });

    return {
      studioId: resolvedStudioId,
      inviteSentTo: maskEmail(ownerEmail),
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

    const staff = [];
    for (const row of rows ?? []) {
      const { data: user } = await supabase.auth.admin.getUserById(row.user_id);
      staff.push({
        userId: row.user_id as string,
        role: row.role as string,
        displayName: row.display_name as string,
        createdAt: row.created_at as string,
        emailMasked: user.user?.email ? maskEmail(user.user.email) : "—",
      });
    }
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
