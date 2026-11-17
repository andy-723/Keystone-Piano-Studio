import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server dependencies are faked so sendBillingEmail runs its real checks without Supabase.
const fake = vi.hoisted(() => ({
  guardians: [{ studio_id: "studio-a", email: "parent@family.test" }],
  owners: [{ studio_id: "studio-a", user_id: "owner-1" }],
  roleOk: true,
}));

vi.mock("@/server/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/env")>();
  return {
    ...original,
    isMockOnboarding: () => false,
    getServerEnv: () => ({
      ...original.getServerEnv(),
      emailFrom: "Keystone Music HQ <noreply@keystonemusichq.com>",
      resendApiKey: "re_test",
    }),
  };
});

vi.mock("@/server/session", () => ({
  verifyAccessToken: async (token: string) => {
    if (token !== "good-token") throw new Error("Invalid or expired session.");
    return { userId: "teacher-1", email: "teacher@studio.test", aal: "aal2", signInMethods: [], accessToken: token };
  },
}));

vi.mock("@/server/authz", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/authz")>();
  return {
    ...original,
    requireStudioRole: async (_user: string, studioId: string) => {
      if (!fake.roleOk || studioId !== "studio-a") throw original.forbidden();
      return "teacher";
    },
  };
});

vi.mock("@/server/supabase", () => {
  function query(table: string) {
    const filters: Record<string, string> = {};
    const rows = () => {
      if (table === "studio") {
        return filters.id === "studio-a"
          ? [{ name: "Sunny Keys Studio", reply_to_email: "hello@sunnykeys.test" }]
          : [];
      }
      if (table === "guardian") {
        return fake.guardians.filter(
          (row) =>
            row.studio_id === filters.studio_id &&
            row.email.toLowerCase() === (filters.email ?? "").toLowerCase(),
        );
      }
      if (table === "studio_member") {
        return fake.owners.filter((row) => row.studio_id === filters.studio_id);
      }
      return [];
    };
    const chain = {
      select: () => chain,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return chain;
      },
      ilike: (column: string, value: string) => {
        filters[column] = value.replace(/\\(.)/g, "$1");
        return chain;
      },
      limit: async () => ({ data: rows(), error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
        resolve({ data: rows(), error: null }),
    };
    return chain;
  }
  return {
    createServiceSupabase: () => ({
      from: query,
      auth: {
        admin: {
          getUserById: async (id: string) => ({
            data: { user: id === "owner-1" ? { email: "owner@sunnykeys.test" } : null },
          }),
        },
      },
    }),
  };
});

import { setEmailProviderForTests, type SendEmailInput } from "@/server/email";
import {
  checkBillingEmailRate,
  cleanParams,
  cleanPdf,
  fromLine,
  resetBillingEmailRateForTests,
  sendBillingEmail,
} from "@/server/billing-email";
import { renderBillingEmail } from "@/server/email/templates/billing";

const pdfBase64 = Buffer.from("%PDF-1.7\nfake invoice").toString("base64");

describe("billing emails from the server (real studios)", () => {
  const sent: SendEmailInput[] = [];

  beforeEach(() => {
    sent.length = 0;
    fake.roleOk = true;
    resetBillingEmailRateForTests();
    setEmailProviderForTests({
      async send(input) {
        sent.push(input);
        return { id: `test-${sent.length}` };
      },
    });
  });

  afterEach(() => setEmailProviderForTests(null));

  it("sends an invoice to the studio's own guardian, with the PDF, from Keystone's address", async () => {
    const result = await sendBillingEmail({
      accessToken: "good-token",
      studioId: "studio-a",
      kind: "invoice_sent",
      to: "Parent@Family.test",
      params: { familyName: "Nguyen family", invoiceNumber: "INV-0001", totalCents: 24000, dueDate: "2026-12-01" },
      pdf: { filename: "INV-0001.pdf", base64: pdfBase64 },
    });

    expect(result).toEqual({ sent: 1 });
    expect(sent).toHaveLength(1);
    const mail = sent[0]!;
    expect(mail.to).toBe("parent@family.test");
    expect(mail.from).toBe("Sunny Keys Studio via Keystone Music HQ <noreply@keystonemusichq.com>");
    expect(mail.replyTo).toBe("hello@sunnykeys.test");
    expect(mail.subject).toBe("Sunny Keys Studio: invoice INV-0001");
    expect(mail.html).toContain("$240.00");
    expect(mail.attachments?.[0]?.filename).toBe("INV-0001.pdf");
    expect(mail.from).not.toContain("keystone.example");
  });

  it("uses the studio name from the database, not one sent by the browser", async () => {
    await sendBillingEmail({
      accessToken: "good-token",
      studioId: "studio-a",
      kind: "payment_receipt",
      to: "parent@family.test",
      params: {
        studioName: "Fake Bank",
        familyName: "Nguyen family",
        invoiceNumber: "INV-0001",
        amountCents: 1000,
        methodLabel: "becs",
        receivedOn: "2026-11-17",
      },
    });
    expect(sent[0]!.subject).toContain("Sunny Keys Studio");
    expect(sent[0]!.html).not.toContain("Fake Bank");
  });

  it("refuses a recipient who isn't a family in this studio", async () => {
    await expect(
      sendBillingEmail({
        accessToken: "good-token",
        studioId: "studio-a",
        kind: "reminder_overdue",
        to: "stranger@elsewhere.test",
        params: { familyName: "x", invoiceNumber: "INV-1", totalCents: 1, dueDate: "2026-11-01" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(sent).toHaveLength(0);
  });

  it("refuses people who aren't staff of the studio, and bad sessions", async () => {
    fake.roleOk = false;
    await expect(
      sendBillingEmail({
        accessToken: "good-token",
        studioId: "studio-a",
        kind: "pause_notice",
        to: "parent@family.test",
        params: { familyName: "x", invoiceNumber: "INV-1" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      sendBillingEmail({
        accessToken: "stolen",
        studioId: "studio-a",
        kind: "pause_notice",
        to: "parent@family.test",
        params: { familyName: "x", invoiceNumber: "INV-1" },
      }),
    ).rejects.toThrow();
    expect(sent).toHaveLength(0);
  });

  it("refuses kinds that aren't billing emails", async () => {
    await expect(
      sendBillingEmail({
        accessToken: "good-token",
        studioId: "studio-a",
        kind: "magic_link" as never,
        to: "parent@family.test",
        params: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("sends bank-detail changes to the studio owners, whatever address the browser gave", async () => {
    await sendBillingEmail({
      accessToken: "good-token",
      studioId: "studio-a",
      kind: "pay_to_changed",
      to: "attacker@elsewhere.test",
      params: { accountName: "Sunny Keys", bsb: "062-000", accountMasked: "•••• 1234" },
    });
    expect(sent.map((mail) => mail.to)).toEqual(["owner@sunnykeys.test"]);
  });

  it("only attaches PDFs to invoices", async () => {
    await sendBillingEmail({
      accessToken: "good-token",
      studioId: "studio-a",
      kind: "credit_note",
      to: "parent@family.test",
      params: { familyName: "x", creditNoteNumber: "CN-1", amountCents: 100, reason: "Sick week" },
      pdf: { filename: "CN-1.pdf", base64: pdfBase64 },
    });
    expect(sent[0]!.attachments).toBeUndefined();
  });
});

describe("billing email input checks", () => {
  it("keeps only short strings and numbers, and drops a browser studio name", () => {
    expect(cleanParams({ familyName: "A", totalCents: 5, studioName: "X", payId: undefined })).toEqual({
      familyName: "A",
      totalCents: 5,
    });
    expect(() => cleanParams({ familyName: { html: "<b>" } })).toThrow();
    expect(() => cleanParams({ familyName: "x".repeat(501) })).toThrow();
    expect(() => cleanParams(null)).toThrow();
  });

  it("only accepts real, small PDFs with a plain file name", () => {
    expect(cleanPdf({ filename: "INV-1.pdf", base64: pdfBase64 })?.contentType).toBe("application/pdf");
    expect(() => cleanPdf({ filename: "../evil.pdf", base64: pdfBase64 })).toThrow();
    expect(() => cleanPdf({ filename: "INV-1.exe", base64: pdfBase64 })).toThrow();
    expect(() =>
      cleanPdf({ filename: "INV-1.pdf", base64: Buffer.from("<html>").toString("base64") }),
    ).toThrow();
  });

  it("builds a safe From line", () => {
    expect(fromLine('Evil" <x@y.z>\r\nBcc: a@b.c', "Keystone <noreply@keystonemusichq.com>")).toBe(
      "Evil x@y.zBcc: a@b.c via Keystone Music HQ <noreply@keystonemusichq.com>",
    );
    expect(fromLine("", "noreply@keystonemusichq.com")).toBe(
      "Your studio via Keystone Music HQ <noreply@keystonemusichq.com>",
    );
  });

  it("caps each person at 300 billing emails an hour", () => {
    resetBillingEmailRateForTests();
    const now = Date.now();
    for (let i = 0; i < 300; i++) expect(checkBillingEmailRate("u1", now)).toBe(true);
    expect(checkBillingEmailRate("u1", now)).toBe(false);
    expect(checkBillingEmailRate("u2", now)).toBe(true);
    expect(checkBillingEmailRate("u1", now + 61 * 60 * 1000)).toBe(true);
  });

  it("renders every kind with the studio name it is given and escapes details", () => {
    const mail = renderBillingEmail("pause_notice", "Sunny Keys", {
      familyName: "<script>",
      invoiceNumber: "INV-9",
    });
    expect(mail.subject).toContain("Sunny Keys");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
