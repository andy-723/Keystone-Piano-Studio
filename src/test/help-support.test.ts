import { beforeEach, describe, expect, it } from "vitest";
import { HELP_ARTICLES, articlesFor } from "@/lib/help/articles";
import { queryTerms, searchArticles } from "@/lib/help/search";
import {
  FAMILY_CATEGORIES,
  STUDIO_CATEGORIES,
  cleanPagePath,
  newSupportReference,
  validateSupportRequest,
} from "@/lib/help/support-request";
import { mockSupportRequests, resetSupportState, submitSupportRequest } from "@/server/support";
import { clearEmailOutbox, getEmailOutbox } from "@/server/email";
import { supportTeamEmail } from "@/server/email/templates/support";

const validStudio = {
  audience: "studio" as const,
  category: "bug",
  subject: "Invoices page is blank",
  message: "When I open Invoices the page stays blank after the term draft.",
};

beforeEach(() => {
  resetSupportState();
  clearEmailOutbox();
});

describe("help articles", () => {
  it("has unique ids and both audiences", () => {
    const ids = HELP_ARTICLES.map((article) => article.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(articlesFor("studio").length).toBeGreaterThanOrEqual(15);
    expect(articlesFor("family").length).toBeGreaterThanOrEqual(10);
  });

  it("every family article has Chinese title and body", () => {
    for (const article of articlesFor("family")) {
      expect(article.title["zh-CN"], article.id).toBeTruthy();
      expect(article.body["zh-CN"], article.id).toBeTruthy();
    }
  });

  it("never promises SMS", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.body.en).not.toMatch(/we (will )?(send|text) (you )?(an )?sms/i);
    }
  });
});

describe("help search", () => {
  it("splits Chinese into two-character pieces and drops English stop words", () => {
    expect(queryTerms("怎么付账单")).toEqual(["怎么", "么付", "付账", "账单"]);
    expect(queryTerms("How do I resend the invites?")).toEqual(["resend", "invite"]);
  });

  it("finds the right studio article for common questions", () => {
    expect(searchArticles("lost my authenticator phone", "studio")[0]?.article.id).toBe(
      "studio-sign-in",
    );
    expect(searchArticles("family never got the invite email", "studio")[0]?.article.id).toBe(
      "studio-invite-not-received",
    );
    expect(searchArticles("import from excel spreadsheet", "studio")[0]?.article.id).toBe(
      "studio-import-students",
    );
    expect(searchArticles("how much is pro", "studio")[0]?.article.id).toBe("studio-plans");
  });

  it("finds family articles in English and Chinese", () => {
    expect(searchArticles("how do I pay the invoice", "family")[0]?.article.id).toBe(
      "family-invoices",
    );
    expect(searchArticles("怎么付账单", "family")[0]?.article.id).toBe("family-invoices");
    expect(searchArticles("孩子生病请假补课", "family")[0]?.article.id).toBe("family-lessons");
  });

  it("keeps audiences apart", () => {
    const ids = searchArticles("invoice", "family").map((match) => match.article.id);
    expect(ids.every((id) => id.startsWith("family-"))).toBe(true);
  });

  it("returns nothing for empty or stop-word queries", () => {
    expect(searchArticles("", "studio")).toEqual([]);
    expect(searchArticles("how do I", "studio")).toEqual([]);
  });
});

describe("support request validation", () => {
  it("routes family lesson, fee and progress questions to the studio", () => {
    const studioOwned = FAMILY_CATEGORIES.filter((c) => c.answeredBy === "studio").map((c) => c.id);
    expect(studioOwned).toEqual(["lessons", "fees", "progress"]);
    expect(STUDIO_CATEGORIES.every((c) => c.answeredBy === "keystone")).toBe(true);
    const result = validateSupportRequest(
      {
        audience: "family",
        category: "fees",
        subject: "Refund",
        message: "Can I get a refund for term 2?",
      },
      { signedIn: true },
    );
    expect(result).toEqual({ ok: false, field: "category", code: "ask_studio" });
  });

  it("needs an email when signed out, and ignores it when signed in", () => {
    expect(validateSupportRequest(validStudio, { signedIn: false })).toMatchObject({
      ok: false,
      field: "contactEmail",
    });
    const signedIn = validateSupportRequest(
      { ...validStudio, contactEmail: "x@y.com" },
      { signedIn: true },
    );
    expect(signedIn.ok && signedIn.value.contactEmail).toBe(null);
  });

  it("enforces lengths and strips control characters", () => {
    expect(
      validateSupportRequest({ ...validStudio, message: "short" }, { signedIn: true }),
    ).toMatchObject({
      code: "too_short",
    });
    expect(
      validateSupportRequest({ ...validStudio, subject: "x".repeat(121) }, { signedIn: true }),
    ).toMatchObject({ code: "too_long" });
    const cleaned = validateSupportRequest(
      { ...validStudio, subject: "Hi\u0000 there\u0007" },
      { signedIn: true },
    );
    expect(cleaned.ok && cleaned.value.subject).toBe("Hi there");
  });

  it("marks security concerns urgent", () => {
    const result = validateSupportRequest(
      { ...validStudio, category: "security" },
      { signedIn: true },
    );
    expect(result.ok && result.value.urgent).toBe(true);
  });

  it("never stores tokens from invite links or query strings in the page path", () => {
    expect(cleanPagePath("/join/abc123secret")).toBe("/join/…");
    expect(cleanPagePath("/auth/callback?token_hash=zzz")).toBe("/auth/…");
    expect(cleanPagePath("/invoices?x=1#y")).toBe("/invoices");
    expect(cleanPagePath("https://evil.example/x")).toBe("");
    expect(cleanPagePath("//evil.example")).toBe("");
  });

  it("makes readable references", () => {
    expect(newSupportReference(() => 0)).toBe("KS-222222");
    expect(newSupportReference()).toMatch(/^KS-[2-9A-HJKMNP-Z]{6}$/);
  });
});

describe("submitSupportRequest (mock mode)", () => {
  it("stores the request, emails support with Reply-To, and acknowledges the requester", async () => {
    const result = await submitSupportRequest(
      {
        ...validStudio,
        contactEmail: "owner@example.com",
        contactName: "Sam",
        pagePath: "/invoices",
      },
      { turnstileToken: "mock-ok", ip: "203.0.113.1" },
    );
    expect(result).toMatchObject({ ok: true, urgent: false });
    expect(mockSupportRequests).toHaveLength(1);
    expect(mockSupportRequests[0]).toMatchObject({
      role: "public",
      requesterEmail: "owner@example.com",
    });
    expect(mockSupportRequests[0]?.emailSentAt).toBeTruthy();
    const outbox = getEmailOutbox();
    expect(outbox).toHaveLength(2);
    expect(outbox[0]).toMatchObject({ replyTo: "owner@example.com" });
    expect(outbox[0]?.subject).toContain(result.ok ? result.reference : "");
    expect(outbox[1]).toMatchObject({ to: "owner@example.com" });
  });

  it("refuses studio-owned family questions on the server too", async () => {
    const result = await submitSupportRequest(
      {
        audience: "family",
        category: "lessons",
        subject: "Change time",
        message: "Can we move to Thursday at 4pm?",
      },
      { demo: true },
    );
    expect(result).toEqual({ ok: false, code: "ask_studio", field: "category" });
    expect(getEmailOutbox()).toHaveLength(0);
  });

  it("acknowledges Chinese requests in Chinese", async () => {
    await submitSupportRequest(
      {
        audience: "family",
        category: "sign_in",
        subject: "无法登录",
        message: "我收不到登录邮件，已经查过垃圾邮件。",
        lang: "zh-CN",
      },
      { demo: true },
    );
    const ack = getEmailOutbox()[1];
    expect(ack?.subject).toContain("我们已收到您的请求");
  });

  it("rate limits by IP", async () => {
    const send = () =>
      submitSupportRequest(
        { ...validStudio, contactEmail: "a@example.com" },
        { ip: "198.51.100.7", turnstileToken: "t" },
      );
    for (let i = 0; i < 5; i += 1) expect((await send()).ok).toBe(true);
    expect(await send()).toEqual({ ok: false, code: "rate_limited" });
  });

  it("adds only role, studio and page to the team email (no automatic family data)", async () => {
    await submitSupportRequest(
      { ...validStudio, suggestedArticleIds: ["studio-term-invoices"] },
      { demo: true },
    );
    const record = mockSupportRequests[0]!;
    const email = supportTeamEmail(record, "https://www.keystonemusichq.com");
    expect(email.text).toContain("FAQs shown before sending: Sending term invoices to families");
    expect(Object.keys(record).sort()).toEqual(
      [
        "audience",
        "category",
        "contactEmail",
        "contactName",
        "createdAt",
        "emailSentAt",
        "id",
        "lang",
        "message",
        "pagePath",
        "reference",
        "requesterEmail",
        "requesterName",
        "requesterUserId",
        "role",
        "status",
        "studioId",
        "studioName",
        "subject",
        "suggestedArticleIds",
        "urgent",
      ].sort(),
    );
  });

  it("escapes HTML in the team email", async () => {
    await submitSupportRequest({ ...validStudio, subject: "<script>x</script>" }, { demo: true });
    expect(getEmailOutbox()[0]?.html).not.toContain("<script>");
  });
});
