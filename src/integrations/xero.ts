import { xeroClientId, xeroClientSecret } from "./config";

const XERO_AUTH = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS = "https://api.xero.com/connections";
const XERO_INVOICES = "https://api.xero.com/api.xro/2.0/Invoices";
const XERO_CONTACTS = "https://api.xero.com/api.xro/2.0/Contacts";

const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.transactions",
  "accounting.contacts",
].join(" ");

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${xeroClientId()}:${xeroClientSecret()}`).toString("base64")}`;
}

export function xeroAuthorizeUrl(input: { redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: xeroClientId(),
    redirect_uri: input.redirectUri,
    scope: SCOPES,
    state: input.state,
  });
  return `${XERO_AUTH}?${params}`;
}

export interface XeroTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export async function exchangeXeroCode(code: string, redirectUri: string): Promise<XeroTokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const response = await fetch(XERO_TOKEN, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) throw new Error(`Xero token exchange failed (${response.status}).`);
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token || !json.refresh_token) throw new Error("Xero did not return tokens.");
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 1800) - 60) * 1000,
  };
}

export async function refreshXeroTokens(refreshToken: string): Promise<XeroTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(XERO_TOKEN, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) throw new Error(`Xero token refresh failed (${response.status}).`);
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token || !json.refresh_token) throw new Error("Xero refresh did not return tokens.");
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 1800) - 60) * 1000,
  };
}

export async function listXeroTenants(accessToken: string) {
  const response = await fetch(XERO_CONNECTIONS, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Xero connections failed (${response.status}).`);
  const json = (await response.json()) as Array<{ tenantId?: string; tenantName?: string }>;
  return json
    .filter((entry) => entry.tenantId)
    .map((entry) => ({ tenantId: entry.tenantId as string, tenantName: entry.tenantName || "Xero organisation" }));
}

async function xeroFetch(input: {
  url: string;
  method?: string;
  accessToken: string;
  tenantId: string;
  body?: unknown;
}) {
  const response = await fetch(input.url, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Xero-Tenant-Id": input.tenantId,
      Accept: "application/json",
      ...(input.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Xero API ${response.status}: ${detail.slice(0, 240)}`);
  }
  return response.json();
}

export async function upsertXeroContact(input: {
  accessToken: string;
  tenantId: string;
  name: string;
  email?: string;
}) {
  const payload = {
    Contacts: [
      {
        Name: input.name,
        EmailAddress: input.email,
      },
    ],
  };
  const json = (await xeroFetch({
    url: XERO_CONTACTS,
    method: "POST",
    accessToken: input.accessToken,
    tenantId: input.tenantId,
    body: payload,
  })) as { Contacts?: Array<{ ContactID?: string; Name?: string }> };
  const contact = json.Contacts?.[0];
  if (!contact?.ContactID) throw new Error("Xero did not return a contact id.");
  return contact.ContactID;
}

export async function createXeroSalesInvoice(input: {
  accessToken: string;
  tenantId: string;
  contactId: string;
  reference: string;
  issueDate: string;
  dueDate: string;
  lineItems: Array<{ description: string; qty: number; unitAmount: number; taxType?: string }>;
  status?: "DRAFT" | "AUTHORISED";
}) {
  const payload = {
    Invoices: [
      {
        Type: "ACCREC",
        Contact: { ContactID: input.contactId },
        Date: input.issueDate,
        DueDate: input.dueDate,
        Reference: input.reference,
        LineAmountTypes: "Inclusive",
        Status: input.status ?? "AUTHORISED",
        LineItems: input.lineItems.map((line) => ({
          Description: line.description,
          Quantity: line.qty,
          UnitAmount: line.unitAmount,
          TaxType: line.taxType ?? "OUTPUT",
        })),
      },
    ],
  };
  const json = (await xeroFetch({
    url: XERO_INVOICES,
    method: "POST",
    accessToken: input.accessToken,
    tenantId: input.tenantId,
    body: payload,
  })) as { Invoices?: Array<{ InvoiceID?: string; InvoiceNumber?: string }> };
  const invoice = json.Invoices?.[0];
  if (!invoice?.InvoiceID) throw new Error("Xero did not return an invoice id.");
  return { invoiceId: invoice.InvoiceID, invoiceNumber: invoice.InvoiceNumber ?? input.reference };
}
