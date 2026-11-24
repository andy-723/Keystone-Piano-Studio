import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { ProblemError, requireRecentMfa, requireStudioRole } from "./authz";
import { getServerEnv } from "./env";
import { verifyAccessToken } from "./session";
import { getStudioAccess } from "./subscription-store";
import { createServiceSupabase } from "./supabase";

/**
 * Xero sync for Pro studios (0022). One way: Keystone pushes sent invoices and recorded payments
 * into the studio's own Xero organisation. Tokens live in Supabase Vault (xero_connection_*
 * functions) and never reach the browser.
 *
 * Cost guard: Xero's free "Starter" developer tier allows 5 connected organisations; a 6th needs
 * a paid tier (A$35/month for up to 50, developer.xero.com/pricing, 19 Nov 2026). Keystone refuses
 * new connections at XERO_MAX_CONNECTIONS (default 5) so nothing is charged without Andrew raising it.
 */

export const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
export const XERO_API = "https://api.xero.com/api.xro/2.0";
/** Granular scopes: Xero apps created on or after 2 March 2026 can't use accounting.transactions. */
export const XERO_SCOPES =
  "offline_access accounting.invoices accounting.payments accounting.contacts accounting.settings.read";
const STATE_TTL_MS = 15 * 60 * 1000;
const PER_RUN_LIMIT = 25;

export type XeroSettings = {
  /** Revenue account for tuition lines (Xero's default "Sales" is 200). */
  salesAccountCode?: string;
  /** Bank account that family payments land in. Needed before payments sync. */
  paymentAccountCode?: string;
  /** Xero's connection id, used to disconnect. */
  connectionId?: string;
};

export type XeroStatus = {
  configured: boolean;
  status: "not_connected" | "connected" | "needs_reconnect";
  organisationName: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  settings: { salesAccountCode: string; paymentAccountCode: string | null };
  /** Pickers, only while connected. */
  accounts?: { revenue: XeroAccountOption[]; bank: XeroAccountOption[] };
  /** False when Keystone has reached its connection cap (new connections are refused). */
  canConnect: boolean;
  plan: "base" | "pro" | null;
};
export type XeroAccountOption = { code: string; name: string };

export function xeroConfig() {
  const env = getServerEnv();
  const read = (name: string) => {
    const value = typeof process !== "undefined" ? process.env[name] : undefined;
    return value && value.trim() ? value.trim() : "";
  };
  const max = Number(read("XERO_MAX_CONNECTIONS") || "5");
  return {
    clientId: read("XERO_CLIENT_ID"),
    clientSecret: read("XERO_CLIENT_SECRET"),
    maxConnections: Number.isFinite(max) && max > 0 ? Math.floor(max) : 5,
    redirectUri: `${env.appUrl}/api/xero/callback`,
    appUrl: env.appUrl,
  };
}

export function isXeroConfigured() {
  const config = xeroConfig();
  return Boolean(config.clientId && config.clientSecret);
}

// ---------------------------------------------------------------------------
// Signed OAuth state: who started the connection, for which studio, until when.
// ---------------------------------------------------------------------------
export function signXeroState(
  payload: { studioId: string; userId: string; exp: number; nonce?: string },
  secret: string,
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, nonce: payload.nonce ?? randomUUID() }),
  ).toString("base64url");
  const mac = createHmac("sha256", `xero-state:${secret}`).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyXeroState(
  state: string,
  secret: string,
  now = Date.now(),
): { studioId: string; userId: string } {
  const [body, mac] = String(state ?? "").split(".");
  if (!body || !mac || !secret)
    throw new ProblemError(400, "Bad state", "Start again from Settings.");
  const expected = createHmac("sha256", `xero-state:${secret}`).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ProblemError(400, "Bad state", "Start again from Settings.");
  }
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    studioId?: string;
    userId?: string;
    exp?: number;
  };
  if (!parsed.studioId || !parsed.userId || !parsed.exp || parsed.exp < now) {
    throw new ProblemError(400, "Link expired", "Start again from Settings.");
  }
  return { studioId: parsed.studioId, userId: parsed.userId };
}

// ---------------------------------------------------------------------------
// Pure payload builders (tested)
// ---------------------------------------------------------------------------
export type InvoiceForXero = {
  id: string;
  number: string | null;
  issue_date: string | null;
  due_date: string | null;
  title: string | null;
  gst_registered: boolean | null;
  status: string;
};
export type LineForXero = {
  description: string;
  qty: number;
  unit_cents: number;
  line_total_cents: number;
  tax_code: string;
};

const money = (cents: number) => Math.round(cents) / 100;

/**
 * ACCREC invoice. Keystone amounts are GST-inclusive when the studio is registered (taxable lines
 * OUTPUT = GST on Income, gst_free lines EXEMPTOUTPUT); otherwise NoTax.
 */
export function buildXeroInvoice(
  invoice: InvoiceForXero,
  lines: LineForXero[],
  contactId: string,
  settings: XeroSettings,
) {
  const registered = Boolean(invoice.gst_registered);
  const account = settings.salesAccountCode || "200";
  return {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    InvoiceNumber: invoice.number ?? undefined,
    Reference: (invoice.title ?? "").slice(0, 255) || undefined,
    Date: invoice.issue_date ?? undefined,
    DueDate: invoice.due_date ?? invoice.issue_date ?? undefined,
    LineAmountTypes: registered ? "Inclusive" : "NoTax",
    Status: "AUTHORISED",
    LineItems: lines.map((line) => {
      // Use the stored line total so Xero's total matches Keystone's to the cent.
      const quantity = line.qty > 0 ? line.qty : 1;
      const unit =
        line.qty > 0 && line.unit_cents * line.qty === line.line_total_cents
          ? line.unit_cents
          : line.line_total_cents / quantity;
      return {
        Description: line.description.slice(0, 4000),
        Quantity: quantity,
        UnitAmount: money(unit),
        AccountCode: account,
        ...(registered
          ? { TaxType: line.tax_code === "gst_free" ? "EXEMPTOUTPUT" : "OUTPUT" }
          : {}),
      };
    }),
  };
}

export type PaymentForXero = {
  id: string;
  amount_cents: number;
  received_on: string;
  method: string;
  reference: string | null;
};

export function buildXeroPayment(
  payment: PaymentForXero,
  xeroInvoiceId: string,
  settings: XeroSettings,
) {
  return {
    Invoice: { InvoiceID: xeroInvoiceId },
    Account: { Code: settings.paymentAccountCode },
    Date: payment.received_on,
    Amount: money(payment.amount_cents),
    Reference: (payment.reference || payment.method).slice(0, 255),
  };
}

/** Payments that belong in Xero: real money in, not credits applied or reversals. */
export function isSyncablePayment(payment: {
  amount_cents: number;
  method: string;
  reverses_payment_id: string | null;
}) {
  return payment.amount_cents > 0 && payment.method !== "credit" && !payment.reverses_payment_id;
}

// ---------------------------------------------------------------------------
// Connection storage and tokens
// ---------------------------------------------------------------------------
type ConnectionRow = {
  id: string;
  studio_id: string;
  external_org_id: string;
  display_name: string | null;
  status: "connected" | "needs_reconnect" | "disconnected";
  last_synced_at: string | null;
  last_error: string | null;
  settings: XeroSettings | null;
};

async function getConnection(studioId: string): Promise<ConnectionRow | null> {
  const { data, error } = await createServiceSupabase()
    .from("oauth_connection")
    .select(
      "id, studio_id, external_org_id, display_name, status, last_synced_at, last_error, settings",
    )
    .eq("studio_id", studioId)
    .eq("provider", "xero")
    .neq("status", "disconnected")
    .maybeSingle();
  if (error) throw new ProblemError(500, "Xero lookup failed", error.message);
  return (data as ConnectionRow | null) ?? null;
}

async function connectedCount(): Promise<number> {
  const { count, error } = await createServiceSupabase()
    .from("oauth_connection")
    .select("id", { count: "exact", head: true })
    .eq("provider", "xero")
    .neq("status", "disconnected");
  if (error) throw new ProblemError(500, "Xero lookup failed", error.message);
  return count ?? 0;
}

async function setConnection(id: string, patch: Record<string, unknown>) {
  await createServiceSupabase().from("oauth_connection").update(patch).eq("id", id);
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const config = xeroConfig();
  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!response.ok || !json.access_token) {
    throw new ProblemError(502, "Xero sign-in failed", json.error ?? `HTTP ${response.status}`);
  }
  return json;
}

/** A current access token, refreshing under the 0003 lease so two workers never both rotate. */
async function accessToken(connection: ConnectionRow): Promise<string> {
  const supabase = createServiceSupabase();
  const read = async () => {
    const { data, error } = await supabase.rpc("xero_connection_tokens", {
      p_connection_id: connection.id,
    });
    const row = (Array.isArray(data) ? data[0] : data) as
      | { access_token: string; refresh_token: string; expires_at: string; token_version: number }
      | undefined;
    if (error || !row) throw new ProblemError(409, "Xero needs reconnecting", error?.message);
    return row;
  };
  let tokens = await read();
  if (Date.parse(tokens.expires_at) - Date.now() > 2 * 60 * 1000) return tokens.access_token;

  const owner = randomUUID();
  const { data: version } = await supabase.rpc("claim_oauth_refresh", {
    connection_id: connection.id,
    owner,
    lease_seconds: 30,
  });
  if (version === null || version === undefined) {
    // Someone else is refreshing: give them a moment, then use what they stored.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    tokens = await read();
    return tokens.access_token;
  }
  try {
    const fresh = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    const { data: saved } = await supabase.rpc("xero_connection_rotate", {
      p_connection_id: connection.id,
      p_owner: owner,
      p_expected_version: version,
      p_access_token: fresh.access_token,
      p_refresh_token: fresh.refresh_token,
      p_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
    });
    if (!saved) throw new ProblemError(409, "Xero token changed", "Try again.");
    return fresh.access_token;
  } catch (error) {
    await supabase.rpc("release_oauth_refresh", { connection_id: connection.id, owner });
    if (error instanceof ProblemError && error.status === 502) {
      // Refresh token refused (expired after 60 days unused, or access removed in Xero).
      await setConnection(connection.id, {
        status: "needs_reconnect",
        last_error: "Xero needs reconnecting. Press Connect Xero again.",
      });
    }
    throw error;
  }
}

async function xeroApi<T>(
  token: string,
  tenantId: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`${XERO_API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await response.json().catch(() => ({}))) as T & {
    Message?: string;
    Elements?: Array<{ ValidationErrors?: Array<{ Message?: string }> }>;
  };
  if (!response.ok) {
    const detail =
      json.Elements?.[0]?.ValidationErrors?.map((e) => e.Message).join("; ") ||
      json.Message ||
      `HTTP ${response.status}`;
    throw new ProblemError(response.status === 429 ? 429 : 502, "Xero request failed", detail);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Studio side
// ---------------------------------------------------------------------------
type StudioRequest = { accessToken: string; studioId: string };

async function studioPlan(studioId: string): Promise<"base" | "pro" | null> {
  const { subscription, level } = await getStudioAccess(studioId);
  if (level !== "full") return null;
  return subscription?.plan === "pro" ? "pro" : subscription ? "base" : "pro";
}

async function listAccounts(connection: ConnectionRow) {
  const token = await accessToken(connection);
  const data = await xeroApi<{
    Accounts?: Array<{
      Code?: string;
      Name?: string;
      Type?: string;
      Class?: string;
      Status?: string;
    }>;
  }>(token, connection.external_org_id, "GET", "Accounts");
  const active = (data.Accounts ?? []).filter((a) => a.Status === "ACTIVE" && a.Code);
  return {
    revenue: active
      .filter((a) => a.Class === "REVENUE")
      .map((a) => ({ code: a.Code!, name: a.Name ?? a.Code! })),
    bank: active
      .filter((a) => a.Type === "BANK")
      .map((a) => ({ code: a.Code!, name: a.Name ?? a.Code! })),
  };
}

export async function getXeroStatus(input: StudioRequest): Promise<XeroStatus> {
  const session = await verifyAccessToken(input.accessToken);
  await requireStudioRole(session.userId, input.studioId, ["owner", "admin"], {
    aal: session.aal,
    access: "read",
  });
  const configured = isXeroConfigured();
  const plan = await studioPlan(input.studioId);
  const connection = configured ? await getConnection(input.studioId) : null;
  const settings = connection?.settings ?? {};
  let accounts: XeroStatus["accounts"];
  if (connection?.status === "connected") {
    accounts = await listAccounts(connection).catch(() => undefined);
  }
  const canConnect =
    configured && (Boolean(connection) || (await connectedCount()) < xeroConfig().maxConnections);
  return {
    configured,
    status: connection
      ? connection.status === "connected"
        ? "connected"
        : "needs_reconnect"
      : "not_connected",
    organisationName: connection?.display_name ?? null,
    lastSyncedAt: connection?.last_synced_at ?? null,
    lastError: connection?.last_error ?? null,
    settings: {
      salesAccountCode: settings.salesAccountCode || "200",
      paymentAccountCode: settings.paymentAccountCode ?? null,
    },
    ...(accounts ? { accounts } : {}),
    canConnect,
    plan,
  };
}

export async function startXeroConnect(input: StudioRequest): Promise<{ url: string }> {
  if (!isXeroConfigured()) {
    throw new ProblemError(503, "Xero is not set up yet", "Keystone's Xero app keys are missing.");
  }
  const session = await verifyAccessToken(input.accessToken);
  await requireStudioRole(session.userId, input.studioId, ["owner"], { aal: session.aal });
  requireRecentMfa(session);
  if ((await studioPlan(input.studioId)) !== "pro") {
    throw new ProblemError(402, "Pro plan needed", "Xero sync is part of Pro.");
  }
  const config = xeroConfig();
  const existing = await getConnection(input.studioId);
  if (!existing && (await connectedCount()) >= config.maxConnections) {
    throw new ProblemError(
      409,
      "Xero connections are full",
      "Keystone has reached its Xero connection limit. Contact support and we'll open more.",
    );
  }
  const state = signXeroState(
    { studioId: input.studioId, userId: session.userId, exp: Date.now() + STATE_TTL_MS },
    config.clientSecret,
  );
  const url = new URL(XERO_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", XERO_SCOPES);
  url.searchParams.set("state", state);
  return { url: url.toString() };
}

/** OAuth callback (browser redirect from Xero). The signed state names the studio and owner. */
export async function finishXeroConnect(code: string, state: string): Promise<string> {
  const config = xeroConfig();
  const { studioId, userId } = verifyXeroState(state, config.clientSecret);
  const existing = await getConnection(studioId);
  if (!existing && (await connectedCount()) >= config.maxConnections) {
    throw new ProblemError(409, "Xero connections are full", "Contact support.");
  }
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const response = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
  });
  const tenants = (await response.json().catch(() => [])) as Array<{
    id: string;
    tenantId: string;
    tenantName?: string;
    tenantType?: string;
    updatedDateUtc?: string;
  }>;
  // The organisation just authorised is the most recently updated one.
  const tenant = tenants
    .filter((t) => t.tenantType === "ORGANISATION")
    .sort((a, b) => Date.parse(b.updatedDateUtc ?? "") - Date.parse(a.updatedDateUtc ?? ""))[0];
  if (!tenant) throw new ProblemError(400, "No Xero organisation", "Pick an organisation in Xero.");

  const { error } = await createServiceSupabase().rpc("xero_connection_save", {
    p_studio_id: studioId,
    p_tenant_id: tenant.tenantId,
    p_tenant_name: (tenant.tenantName ?? "Xero").slice(0, 200),
    p_access_token: tokens.access_token,
    p_refresh_token: tokens.refresh_token,
    p_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    p_user_id: userId,
    p_settings: {
      ...(existing?.settings ?? {}),
      connectionId: tenant.id,
    },
  });
  if (error) throw new ProblemError(500, "Xero connection save failed", error.message);
  return `${config.appUrl}/settings?xero=connected`;
}

export async function saveXeroSettings(
  input: StudioRequest & { salesAccountCode?: string; paymentAccountCode?: string },
): Promise<XeroStatus> {
  const session = await verifyAccessToken(input.accessToken);
  await requireStudioRole(session.userId, input.studioId, ["owner", "admin"], { aal: session.aal });
  const connection = await getConnection(input.studioId);
  if (!connection) throw new ProblemError(409, "Xero isn't connected");
  const clean = (value?: string) =>
    value && /^[A-Za-z0-9._-]{1,10}$/.test(value) ? value : undefined;
  await setConnection(connection.id, {
    settings: {
      ...(connection.settings ?? {}),
      ...(clean(input.salesAccountCode) ? { salesAccountCode: clean(input.salesAccountCode) } : {}),
      ...(clean(input.paymentAccountCode)
        ? { paymentAccountCode: clean(input.paymentAccountCode) }
        : {}),
    },
    last_error: null,
  });
  return getXeroStatus(input);
}

export async function disconnectXero(input: StudioRequest): Promise<XeroStatus> {
  const session = await verifyAccessToken(input.accessToken);
  await requireStudioRole(session.userId, input.studioId, ["owner"], { aal: session.aal });
  requireRecentMfa(session);
  const connection = await getConnection(input.studioId);
  if (connection) {
    // Tell Xero too, so the connection stops counting against Keystone's limit.
    if (connection.status === "connected" && connection.settings?.connectionId) {
      try {
        const token = await accessToken(connection);
        await fetch(
          `${XERO_CONNECTIONS_URL}/${encodeURIComponent(connection.settings.connectionId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      } catch {
        // Still forget the tokens locally.
      }
    }
    await createServiceSupabase().rpc("xero_connection_forget", { p_connection_id: connection.id });
  }
  return getXeroStatus(input);
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------
export type SyncResult = { invoices: number; payments: number; skipped?: string };

async function contactFor(
  token: string,
  tenantId: string,
  family: { id: string; display_name: string; xero_contact_id: string | null },
  email: string | null,
): Promise<string> {
  if (family.xero_contact_id) return family.xero_contact_id;
  const name = family.display_name.trim().slice(0, 255) || "Family";
  const found = await xeroApi<{ Contacts?: Array<{ ContactID: string }> }>(
    token,
    tenantId,
    "GET",
    `Contacts?where=${encodeURIComponent(`Name=="${name.replace(/"/g, "")}"`)}`,
  );
  let contactId = found.Contacts?.[0]?.ContactID;
  if (!contactId) {
    const created = await xeroApi<{ Contacts?: Array<{ ContactID: string }> }>(
      token,
      tenantId,
      "POST",
      "Contacts",
      { Contacts: [{ Name: name, ...(email ? { EmailAddress: email } : {}) }] },
      `keystone-contact-${family.id}`,
    );
    contactId = created.Contacts?.[0]?.ContactID;
  }
  if (!contactId) throw new ProblemError(502, "Xero contact failed");
  await createServiceSupabase()
    .from("family")
    .update({ xero_contact_id: contactId })
    .eq("id", family.id);
  return contactId;
}

export async function syncStudioToXero(studioId: string): Promise<SyncResult> {
  if (!isXeroConfigured()) return { invoices: 0, payments: 0, skipped: "not configured" };
  const connection = await getConnection(studioId);
  if (!connection || connection.status !== "connected") {
    return { invoices: 0, payments: 0, skipped: "not connected" };
  }
  if ((await studioPlan(studioId)) !== "pro") {
    return { invoices: 0, payments: 0, skipped: "not on Pro" };
  }
  const supabase = createServiceSupabase();
  const settings = connection.settings ?? {};
  const tenantId = connection.external_org_id;
  let invoices = 0;
  let payments = 0;
  try {
    const token = await accessToken(connection);

    const { data: pending, error } = await supabase
      .from("invoice")
      .select(
        "id, family_id, number, issue_date, due_date, title, gst_registered, status, bill_to_guardian_id",
      )
      .eq("studio_id", studioId)
      .is("xero_invoice_id", null)
      .in("status", ["sent", "partially_paid", "paid"])
      .order("issue_date", { ascending: true })
      .limit(PER_RUN_LIMIT);
    if (error) throw new ProblemError(500, "Invoice lookup failed", error.message);

    for (const invoice of pending ?? []) {
      const [{ data: family }, { data: lines }, { data: guardians }] = await Promise.all([
        supabase
          .from("family")
          .select("id, display_name, xero_contact_id")
          .eq("id", invoice.family_id)
          .maybeSingle(),
        supabase
          .from("invoice_line")
          .select("description, qty, unit_cents, line_total_cents, tax_code")
          .eq("invoice_id", invoice.id)
          .order("created_at", { ascending: true }),
        supabase.from("guardian").select("id, email").eq("family_id", invoice.family_id),
      ]);
      if (!family || !lines?.length) continue;
      const email =
        guardians?.find((g) => g.id === invoice.bill_to_guardian_id)?.email ??
        guardians?.[0]?.email ??
        null;
      const contactId = await contactFor(token, tenantId, family, email);
      const result = await xeroApi<{ Invoices?: Array<{ InvoiceID: string }> }>(
        token,
        tenantId,
        "POST",
        "Invoices",
        {
          Invoices: [
            buildXeroInvoice(
              invoice as InvoiceForXero,
              lines as LineForXero[],
              contactId,
              settings,
            ),
          ],
        },
        `keystone-invoice-${invoice.id}`,
      );
      const xeroId = result.Invoices?.[0]?.InvoiceID;
      if (!xeroId) continue;
      await supabase
        .from("invoice")
        .update({ xero_invoice_id: xeroId, xero_synced_at: new Date().toISOString() })
        .eq("id", invoice.id);
      invoices += 1;
    }

    if (settings.paymentAccountCode) {
      const { data: unsynced } = await supabase
        .from("payment")
        .select("id, invoice_id, amount_cents, received_on, method, reference, reverses_payment_id")
        .eq("studio_id", studioId)
        .is("xero_payment_id", null)
        .order("received_on", { ascending: true })
        .limit(PER_RUN_LIMIT);
      const candidates = (unsynced ?? []).filter(isSyncablePayment);
      const invoiceIds = [...new Set(candidates.map((p) => p.invoice_id as string))];
      const { data: linked } = invoiceIds.length
        ? await supabase.from("invoice").select("id, xero_invoice_id").in("id", invoiceIds)
        : { data: [] };
      const xeroIdFor = new Map(
        (linked ?? []).map((row) => [row.id as string, row.xero_invoice_id as string | null]),
      );
      for (const payment of candidates) {
        const xeroInvoiceId = xeroIdFor.get(payment.invoice_id as string);
        if (!xeroInvoiceId) continue; // its invoice goes first
        const result = await xeroApi<{ Payments?: Array<{ PaymentID: string }> }>(
          token,
          tenantId,
          "PUT",
          "Payments",
          { Payments: [buildXeroPayment(payment as PaymentForXero, xeroInvoiceId, settings)] },
          `keystone-payment-${payment.id}`,
        );
        const paymentId = result.Payments?.[0]?.PaymentID;
        if (!paymentId) continue;
        await supabase
          .from("payment")
          .update({ xero_payment_id: paymentId, xero_synced_at: new Date().toISOString() })
          .eq("id", payment.id);
        payments += 1;
      }
    }

    await setConnection(connection.id, {
      last_synced_at: new Date().toISOString(),
      last_error: settings.paymentAccountCode
        ? null
        : "Choose the bank account for payments so they can be sent to Xero.",
    });
    return { invoices, payments };
  } catch (error) {
    const message =
      error instanceof ProblemError ? `${error.title}: ${error.message}` : "Sync failed";
    await setConnection(connection.id, { last_error: message.slice(0, 500) });
    return { invoices, payments, skipped: message };
  }
}

export async function syncXeroNow(input: StudioRequest): Promise<SyncResult> {
  const session = await verifyAccessToken(input.accessToken);
  await requireStudioRole(session.userId, input.studioId, ["owner", "admin"], { aal: session.aal });
  return syncStudioToXero(input.studioId);
}

/** Cron: every connected studio, one at a time (Xero allows 60 calls a minute per organisation). */
export async function runXeroSync(): Promise<{
  studios: number;
  invoices: number;
  payments: number;
}> {
  if (!isXeroConfigured()) return { studios: 0, invoices: 0, payments: 0 };
  const { data } = await createServiceSupabase()
    .from("oauth_connection")
    .select("studio_id")
    .eq("provider", "xero")
    .eq("status", "connected");
  let invoices = 0;
  let payments = 0;
  for (const row of data ?? []) {
    const result = await syncStudioToXero(row.studio_id as string);
    invoices += result.invoices;
    payments += result.payments;
  }
  return { studios: data?.length ?? 0, invoices, payments };
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------
export const getXeroStatusFn = createServerFn({ method: "POST" })
  .validator((data: StudioRequest) => data)
  .handler(({ data }) => getXeroStatus(data));

export const startXeroConnectFn = createServerFn({ method: "POST" })
  .validator((data: StudioRequest) => data)
  .handler(({ data }) => startXeroConnect(data));

export const saveXeroSettingsFn = createServerFn({ method: "POST" })
  .validator(
    (data: StudioRequest & { salesAccountCode?: string; paymentAccountCode?: string }) => data,
  )
  .handler(({ data }) => saveXeroSettings(data));

export const disconnectXeroFn = createServerFn({ method: "POST" })
  .validator((data: StudioRequest) => data)
  .handler(({ data }) => disconnectXero(data));

export const syncXeroNowFn = createServerFn({ method: "POST" })
  .validator((data: StudioRequest) => data)
  .handler(({ data }) => syncXeroNow(data));
