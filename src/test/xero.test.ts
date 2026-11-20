import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildXeroInvoice,
  buildXeroPayment,
  isSyncablePayment,
  isXeroConfigured,
  signXeroState,
  verifyXeroState,
  xeroConfig,
  XERO_SCOPES,
} from "@/server/xero";

const SECRET = "xero-client-secret";
const invoice = {
  id: "inv-1",
  number: "INV-0012",
  issue_date: "2026-11-19",
  due_date: "2026-12-03",
  title: "Term 4 lessons",
  gst_registered: false,
  status: "sent",
};
const lines = [
  {
    description: "Ava – 30 min lessons",
    qty: 8,
    unit_cents: 4500,
    line_total_cents: 36000,
    tax_code: "taxable",
  },
  {
    description: "Exam fee",
    qty: 1,
    unit_cents: 9500,
    line_total_cents: 9500,
    tax_code: "gst_free",
  },
];

afterEach(() => vi.unstubAllEnvs());

describe("Xero OAuth state", () => {
  it("round-trips the studio and owner", () => {
    const state = signXeroState({ studioId: "s1", userId: "u1", exp: Date.now() + 60_000 }, SECRET);
    expect(verifyXeroState(state, SECRET)).toEqual({ studioId: "s1", userId: "u1" });
  });
  it("refuses a tampered, foreign or expired state", () => {
    const state = signXeroState({ studioId: "s1", userId: "u1", exp: Date.now() + 60_000 }, SECRET);
    const [body, mac] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ studioId: "s2", userId: "u1", exp: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(() => verifyXeroState(`${forged}.${mac}`, SECRET)).toThrow();
    expect(() => verifyXeroState(`${body}.${mac}`, "other-secret")).toThrow();
    const old = signXeroState({ studioId: "s1", userId: "u1", exp: Date.now() - 1 }, SECRET);
    expect(() => verifyXeroState(old, SECRET)).toThrow();
  });
});

describe("Xero payloads", () => {
  it("sends a NoTax invoice for a studio that isn't GST registered", () => {
    const body = buildXeroInvoice(invoice, lines, "contact-1", {});
    expect(body).toMatchObject({
      Type: "ACCREC",
      Contact: { ContactID: "contact-1" },
      InvoiceNumber: "INV-0012",
      LineAmountTypes: "NoTax",
      Status: "AUTHORISED",
      Date: "2026-11-19",
      DueDate: "2026-12-03",
    });
    expect(body.LineItems[0]).toEqual({
      Description: "Ava – 30 min lessons",
      Quantity: 8,
      UnitAmount: 45,
      AccountCode: "200",
    });
  });

  it("uses GST-inclusive amounts with GST on Income and GST-free tax types when registered", () => {
    const body = buildXeroInvoice({ ...invoice, gst_registered: true }, lines, "c", {
      salesAccountCode: "260",
    });
    expect(body.LineAmountTypes).toBe("Inclusive");
    expect(body.LineItems.map((l) => [l.AccountCode, l.TaxType])).toEqual([
      ["260", "OUTPUT"],
      ["260", "EXEMPTOUTPUT"],
    ]);
  });

  it("keeps Keystone's line total when qty × unit doesn't match it", () => {
    const body = buildXeroInvoice(invoice, [{ ...lines[0]!, line_total_cents: 35000 }], "c", {});
    expect(body.LineItems[0]!.Quantity * body.LineItems[0]!.UnitAmount).toBeCloseTo(350);
  });

  it("builds a payment against the Xero invoice into the chosen bank account", () => {
    expect(
      buildXeroPayment(
        {
          id: "p1",
          amount_cents: 45500,
          received_on: "2026-11-20",
          method: "stripe_card",
          reference: null,
        },
        "xero-inv",
        { paymentAccountCode: "090" },
      ),
    ).toEqual({
      Invoice: { InvoiceID: "xero-inv" },
      Account: { Code: "090" },
      Date: "2026-11-20",
      Amount: 455,
      Reference: "stripe_card",
    });
  });

  it("only sends real money in", () => {
    expect(
      isSyncablePayment({ amount_cents: 100, method: "bank_transfer", reverses_payment_id: null }),
    ).toBe(true);
    expect(
      isSyncablePayment({ amount_cents: 100, method: "credit", reverses_payment_id: null }),
    ).toBe(false);
    expect(
      isSyncablePayment({ amount_cents: -100, method: "bank_transfer", reverses_payment_id: "p" }),
    ).toBe(false);
  });
});

describe("Xero config", () => {
  it("asks for the granular scopes new Xero apps must use", () => {
    expect(XERO_SCOPES).toContain("accounting.invoices");
    expect(XERO_SCOPES).toContain("accounting.payments");
    expect(XERO_SCOPES).toContain("offline_access");
    expect(XERO_SCOPES).not.toContain("accounting.transactions");
  });
  it("caps connections at Xero's free 5 unless raised", () => {
    vi.stubEnv("XERO_MAX_CONNECTIONS", "");
    expect(xeroConfig().maxConnections).toBe(5);
    vi.stubEnv("XERO_MAX_CONNECTIONS", "50");
    expect(xeroConfig().maxConnections).toBe(50);
  });
  it("is off until both keys are set", () => {
    vi.stubEnv("XERO_CLIENT_ID", "id");
    vi.stubEnv("XERO_CLIENT_SECRET", "");
    expect(isXeroConfigured()).toBe(false);
    vi.stubEnv("XERO_CLIENT_SECRET", "secret");
    expect(isXeroConfigured()).toBe(true);
  });
});
