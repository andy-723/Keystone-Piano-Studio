import { describe, expect, it } from "vitest";
import {
  KEYSTONE_MAIL_FALLBACK,
  familyInvoiceLink,
  studioReplyTo,
  studioSenderFrom,
} from "@/lib/studio-mail";

describe("studio mail helpers (S6)", () => {
  it("prefers the studio email and falls back to Keystone's domain", () => {
    expect(studioSenderFrom("Clarke Piano", "hello@clarke.example")).toBe(
      "Clarke Piano <hello@clarke.example>",
    );
    expect(studioSenderFrom("Clarke Piano", "  ")).toBe(
      `Clarke Piano <${KEYSTONE_MAIL_FALLBACK}>`,
    );
    expect(studioReplyTo(undefined)).toBe(KEYSTONE_MAIL_FALLBACK);
    expect(studioReplyTo("billing@studio.test")).toBe("billing@studio.test");
  });

  it("builds a family portal invoice deep link", () => {
    const link = familyInvoiceLink("inv-10");
    expect(link).toContain("view=invoices");
    expect(link).toContain("invoice=inv-10");
    expect(link).not.toContain("keystone.example");
  });
});
