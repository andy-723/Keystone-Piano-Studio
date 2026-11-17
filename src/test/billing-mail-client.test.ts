import { afterEach, describe, expect, it } from "vitest";
import { sendBillingMail, setLiveBillingMailSenderForTests } from "@/services/billing-mail";
import { resetStudioWorkspaceForTests, setStudioWorkspace } from "@/lib/studio-workspace";
import { clearEmailOutbox, getEmailOutbox } from "@/server/email";

describe("sendBillingMail", () => {
  afterEach(() => {
    setLiveBillingMailSenderForTests(null);
    resetStudioWorkspaceForTests();
    clearEmailOutbox();
  });

  it("demo studio: renders locally into the mock outbox, never a keystone.example sender", async () => {
    clearEmailOutbox();
    await sendBillingMail({
      kind: "invoice_sent",
      to: "parent@family.test",
      studioName: "Clarke Piano Studio",
      params: { familyName: "Lee family", invoiceNumber: "INV-7", totalCents: 5000, dueDate: "2027-03-29" },
      pdf: { filename: "INV-7.pdf", bytes: new TextEncoder().encode("%PDF-1.7") },
    });
    const [mail] = getEmailOutbox();
    expect(mail?.subject).toBe("Clarke Piano Studio: invoice INV-7");
    expect(mail?.from).toContain("via Keystone Music HQ <noreply@keystonemusichq.com>");
    expect(mail?.from).not.toContain("keystone.example");
    expect(mail?.attachments?.[0]?.filename).toBe("INV-7.pdf");
  });

  it("real studio: asks the server to send, with details only (no HTML) and the PDF as base64", async () => {
    setStudioWorkspace({ mode: "live", studioId: "studio-a", userId: "teacher-1", role: "teacher" });
    const calls: unknown[] = [];
    setLiveBillingMailSenderForTests(async (input) => {
      calls.push(input);
    });
    await sendBillingMail({
      kind: "invoice_sent",
      to: "parent@family.test",
      studioName: "Ignored",
      params: { familyName: "Lee family", invoiceNumber: "INV-7", totalCents: 5000, dueDate: "2026-12-01" },
      pdf: { filename: "INV-7.pdf", bytes: new TextEncoder().encode("%PDF-1.7") },
    });
    expect(calls).toHaveLength(1);
    const call = calls[0] as Record<string, unknown>;
    expect(call).toMatchObject({
      studioId: "studio-a",
      kind: "invoice_sent",
      to: "parent@family.test",
      params: { invoiceNumber: "INV-7" },
      pdf: { filename: "INV-7.pdf", base64: btoa("%PDF-1.7") },
    });
    expect(call).not.toHaveProperty("html");
    expect(getEmailOutbox()).toHaveLength(0);
  });
});
