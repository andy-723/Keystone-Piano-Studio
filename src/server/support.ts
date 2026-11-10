import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { getServerEnv, isMockOnboarding } from "./env";
import { verifyAccessToken } from "./session";
import { resolveAccountForUser } from "./account";
import { requirePlatformAdmin } from "./authz";
import { createServiceSupabase } from "./supabase";
import { verifyTurnstile } from "./turnstile";
import { getEmailProvider } from "./email";
import { supportAckEmail, supportTeamEmail } from "./email/templates/support";
import { ProblemError } from "./problem";
import { checkAdminActionRate } from "./rate-limit";
import {
  newSupportReference,
  validateSupportRequest,
  type CleanSupportRequest,
  type SupportRequestInput,
} from "@/lib/help/support-request";

/**
 * Support requests (help centre "Still need help?"). Sends to Keystone support by email
 * (SUPPORT_EMAIL, from EMAIL_FROM via Resend) and keeps a record in support_request (0007).
 *
 * Privacy: nothing about students or families is attached automatically. The only context
 * added is the requester's role, studio id/name and the app path they were on.
 */

export type SupportRole =
  "platform_staff" | "owner" | "admin" | "teacher" | "guardian" | "public" | "demo";

export type SupportRecord = CleanSupportRequest & {
  id: string;
  reference: string;
  createdAt: string;
  requesterUserId: string | null;
  requesterEmail: string;
  requesterName: string | null;
  role: SupportRole;
  studioId: string | null;
  studioName: string | null;
  status: "open" | "closed";
  emailSentAt: string | null;
};

export type SubmitSupportResult =
  | { ok: true; reference: string; urgent: boolean }
  | {
      ok: false;
      code:
        | "required"
        | "too_long"
        | "too_short"
        | "invalid"
        | "ask_studio"
        | "captcha"
        | "rate_limited"
        | "unauthorized"
        | "failed";
      field?: string;
    };

/** In-memory store for mock mode and unit tests. */
export const mockSupportRequests: SupportRecord[] = [];

export function resetSupportState() {
  mockSupportRequests.length = 0;
  rateHits.clear();
}

// ---------------------------------------------------------------------------
// Rate limit: per IP and per signed-in user, sliding window. In-memory per server
// instance (same model as rate-limit.ts); Turnstile covers signed-out abuse.
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 5;
const rateHits = new Map<string, number[]>();

export function checkSupportRate(key: string, now = Date.now()): boolean {
  const recent = (rateHits.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    rateHits.set(key, recent);
    return false;
  }
  recent.push(now);
  rateHits.set(key, recent);
  return true;
}

function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) / 2 ** 32;
}

type Requester = {
  userId: string | null;
  email: string;
  name: string | null;
  role: SupportRole;
  studioId: string | null;
  studioName: string | null;
};

async function studioNameFor(studioId: string | null): Promise<string | null> {
  if (!studioId || isMockOnboarding()) return null;
  // Service-key read of one studio name for the requester's own studio (resolved from their
  // verified account, never from the request body).
  const { data } = await createServiceSupabase()
    .from("studio")
    .select("name")
    .eq("id", studioId)
    .maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

async function resolveRequester(
  value: CleanSupportRequest,
  ctx: { accessToken?: string | undefined; demo?: boolean | undefined },
): Promise<Requester> {
  if (ctx.accessToken && !isMockOnboarding()) {
    const session = await verifyAccessToken(ctx.accessToken);
    const account = await resolveAccountForUser(session.userId, session.email, session.aal);
    const membership = account.memberships[0];
    const guardianStudio = account.studioAccess.find((entry) => entry.role === "guardian");
    const role: SupportRole = account.platformStaff
      ? "platform_staff"
      : membership
        ? (membership.role as SupportRole)
        : account.guardianFamilyIds.length > 0
          ? "guardian"
          : "public";
    // A person who is both staff and a parent: use the side they asked from.
    const studioId =
      value.audience === "family"
        ? (guardianStudio?.studioId ?? membership?.studioId ?? null)
        : (membership?.studioId ?? guardianStudio?.studioId ?? null);
    if (!session.email) throw new ProblemError(401, "Unauthorized", "Account has no email.");
    return {
      userId: session.userId,
      email: session.email,
      name: null,
      role: value.audience === "family" && guardianStudio ? "guardian" : role,
      studioId,
      studioName: await studioNameFor(studioId),
    };
  }
  if (ctx.demo && isMockOnboarding()) {
    return {
      userId: null,
      email: "demo@keystone.local",
      name: value.audience === "family" ? "Demo family" : "Demo teacher",
      role: "demo",
      studioId: null,
      studioName: "Demo studio",
    };
  }
  return {
    userId: null,
    email: value.contactEmail ?? "",
    name: value.contactName,
    role: "public",
    studioId: null,
    studioName: null,
  };
}

async function storeRecord(record: SupportRecord): Promise<boolean> {
  if (isMockOnboarding()) {
    mockSupportRequests.push(structuredClone(record));
    return true;
  }
  // Service-key insert: support_request has no insert policy for API roles (0007).
  const { error } = await createServiceSupabase()
    .from("support_request")
    .insert({
      id: record.id,
      reference: record.reference,
      requester_user_id: record.requesterUserId,
      requester_email: record.requesterEmail,
      requester_name: record.requesterName,
      role: record.role,
      studio_id: record.studioId,
      audience: record.audience,
      category: record.category,
      urgent: record.urgent,
      subject: record.subject,
      message: record.message,
      lang: record.lang,
      page_path: record.pagePath || null,
      suggested_article_ids: record.suggestedArticleIds,
    });
  if (error) {
    console.error("support_request insert failed", {
      reference: record.reference,
      code: error.code,
    });
    return false;
  }
  return true;
}

async function markEmailed(record: SupportRecord) {
  record.emailSentAt = new Date().toISOString();
  if (isMockOnboarding()) {
    const row = mockSupportRequests.find((entry) => entry.id === record.id);
    if (row) row.emailSentAt = record.emailSentAt;
    return;
  }
  await createServiceSupabase()
    .from("support_request")
    .update({ email_sent_at: record.emailSentAt })
    .eq("id", record.id);
}

/** Core logic, separate from the server function so tests can call it directly. */
export async function submitSupportRequest(
  input: Partial<SupportRequestInput>,
  ctx: {
    accessToken?: string | undefined;
    turnstileToken?: string | undefined;
    ip?: string | undefined;
    demo?: boolean | undefined;
  },
): Promise<SubmitSupportResult> {
  const signedIn = Boolean(ctx.accessToken) || Boolean(ctx.demo && isMockOnboarding());
  const checked = validateSupportRequest(input, { signedIn });
  if (!checked.ok) return { ok: false, code: checked.code, field: checked.field };
  const value = checked.value;

  if (ctx.ip && !checkSupportRate(`ip:${ctx.ip}`)) return { ok: false, code: "rate_limited" };
  if (!signedIn && !(await verifyTurnstile(ctx.turnstileToken, ctx.ip))) {
    return { ok: false, code: "captcha" };
  }

  let requester: Requester;
  try {
    requester = await resolveRequester(value, ctx);
  } catch {
    return { ok: false, code: "unauthorized" };
  }
  if (requester.userId && !checkSupportRate(`user:${requester.userId}`)) {
    return { ok: false, code: "rate_limited" };
  }

  const record: SupportRecord = {
    ...value,
    id: crypto.randomUUID(),
    reference: newSupportReference(cryptoRandom),
    createdAt: new Date().toISOString(),
    requesterUserId: requester.userId,
    requesterEmail: requester.email,
    requesterName: requester.name,
    role: requester.role,
    studioId: requester.studioId,
    studioName: requester.studioName,
    status: "open",
    emailSentAt: null,
  };

  const stored = await storeRecord(record);

  const env = getServerEnv();
  const provider = getEmailProvider();
  let emailed = false;
  try {
    const team = supportTeamEmail(record, env.appUrl);
    await provider.send({
      to: env.supportEmail,
      from: env.emailFrom,
      replyTo: record.requesterEmail,
      subject: team.subject,
      html: team.html,
      text: team.text,
      tags: [{ name: "kind", value: "support_request" }],
    });
    emailed = true;
    if (stored) await markEmailed(record);
  } catch (error) {
    console.error("support email failed", {
      reference: record.reference,
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  // Neither saved nor emailed: the request would be lost, so tell the person.
  if (!stored && !emailed) return { ok: false, code: "failed" };

  try {
    const ack = supportAckEmail(record);
    await provider.send({
      to: record.requesterEmail,
      from: env.emailFrom,
      replyTo: env.supportEmail,
      subject: ack.subject,
      html: ack.html,
      text: ack.text,
      tags: [{ name: "kind", value: "support_ack" }],
    });
  } catch {
    // The request is in; a missing acknowledgement isn't worth failing it for.
  }

  return { ok: true, reference: record.reference, urgent: record.urgent };
}

function requestIp(): string | undefined {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? undefined;
  } catch {
    return undefined;
  }
}

export const submitSupportRequestFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      request: Partial<SupportRequestInput>;
      accessToken?: string | undefined;
      turnstileToken?: string | undefined;
      demo?: boolean | undefined;
    }) => data,
  )
  .handler(async ({ data }) =>
    submitSupportRequest(data.request ?? {}, {
      accessToken: data.accessToken || undefined,
      turnstileToken: data.turnstileToken || undefined,
      demo: data.demo,
      ip: requestIp(),
    }),
  );

export const getSupportTurnstileSiteKeyFn = createServerFn({ method: "GET" }).handler(() => ({
  siteKey: getServerEnv().turnstileSiteKey,
  mock: isMockOnboarding(),
}));

// ---------------------------------------------------------------------------
// Platform admin: list and close requests (/admin, Support tab)
// ---------------------------------------------------------------------------

export type SupportListRow = Pick<
  SupportRecord,
  | "id"
  | "reference"
  | "createdAt"
  | "requesterEmail"
  | "role"
  | "studioId"
  | "audience"
  | "category"
  | "urgent"
  | "subject"
  | "message"
  | "status"
  | "emailSentAt"
>;

async function gateSupportAdmin(accessToken: string) {
  const ip = requestIp();
  if (ip && !checkAdminActionRate(ip)) {
    throw new ProblemError(429, "Too many requests", "Try again in a minute.");
  }
  const session = await verifyAccessToken(accessToken);
  // requirePlatformAdmin guards every service-key call below.
  await requirePlatformAdmin(session.userId, { aal: session.aal });
}

export const listSupportRequestsFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; status?: "open" | "closed" | "all" }) => data)
  .handler(async ({ data }): Promise<{ rows: SupportListRow[] }> => {
    if (isMockOnboarding()) {
      // Demo data only, and never from a production build (public form entries hold emails).
      if (process.env["NODE_ENV"] === "production") return { rows: [] };
      const rows = mockSupportRequests
        .filter((row) => !data.status || data.status === "all" || row.status === data.status)
        .slice()
        .reverse();
      return { rows };
    }
    await gateSupportAdmin(data.accessToken);
    let query = createServiceSupabase()
      .from("support_request")
      .select(
        "id, reference, created_at, requester_email, role, studio_id, audience, category, urgent, subject, message, status, email_sent_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new ProblemError(500, "Support list failed", error.message);
    return {
      rows: (rows ?? []).map((row) => ({
        id: row.id as string,
        reference: row.reference as string,
        createdAt: row.created_at as string,
        requesterEmail: row.requester_email as string,
        role: row.role as SupportRole,
        studioId: (row.studio_id as string | null) ?? null,
        audience: row.audience as SupportRecord["audience"],
        category: row.category as string,
        urgent: Boolean(row.urgent),
        subject: row.subject as string,
        message: row.message as string,
        status: row.status as SupportRecord["status"],
        emailSentAt: (row.email_sent_at as string | null) ?? null,
      })),
    };
  });

export const setSupportRequestStatusFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; id: string; status: "open" | "closed" }) => data)
  .handler(async ({ data }) => {
    const status = data.status === "closed" ? "closed" : "open";
    if (isMockOnboarding()) {
      const row = mockSupportRequests.find((entry) => entry.id === data.id);
      if (row) row.status = status;
      return { ok: true as const };
    }
    await gateSupportAdmin(data.accessToken);
    const { error } = await createServiceSupabase()
      .from("support_request")
      .update({ status, closed_at: status === "closed" ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new ProblemError(500, "Support update failed", error.message);
    return { ok: true as const };
  });
