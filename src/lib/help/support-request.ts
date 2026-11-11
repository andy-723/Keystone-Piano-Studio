import type { HelpAudience, HelpLang, LocalisedText } from "./articles";

/**
 * Support request categories. `answeredBy: "studio"` means the family's studio, not Keystone,
 * is the right place for the question (lessons, fees, refunds, progress — family app terms A1
 * and A5). The form offers "Message your teacher" for those instead of sending a ticket, and
 * the server refuses them too.
 */
export type SupportCategory = {
  id: string;
  label: LocalisedText;
  answeredBy: "keystone" | "studio";
  urgent?: boolean;
};

export const STUDIO_CATEGORIES: SupportCategory[] = [
  {
    id: "new_studio",
    label: { en: "Set up a new studio or ask about plans" },
    answeredBy: "keystone",
  },
  { id: "sign_in", label: { en: "Sign-in or two-step sign-in" }, answeredBy: "keystone" },
  { id: "families", label: { en: "Enrolling or inviting families" }, answeredBy: "keystone" },
  { id: "family_billing", label: { en: "Family invoices and payments" }, answeredBy: "keystone" },
  { id: "keystone_plan", label: { en: "My Keystone plan or bill" }, answeredBy: "keystone" },
  { id: "bug", label: { en: "Something isn't working" }, answeredBy: "keystone" },
  { id: "idea", label: { en: "Suggest an improvement" }, answeredBy: "keystone" },
  {
    id: "security",
    label: { en: "Security or privacy concern" },
    answeredBy: "keystone",
    urgent: true,
  },
  { id: "other", label: { en: "Something else" }, answeredBy: "keystone" },
];

export const FAMILY_CATEGORIES: SupportCategory[] = [
  {
    id: "lessons",
    label: { en: "Lesson times, cancellations or make-ups", "zh-CN": "上课时间、取消或补课", vi: "Giờ học, hủy buổi hoặc học bù" },
    answeredBy: "studio",
  },
  {
    id: "fees",
    label: { en: "Fees, invoices or refunds", "zh-CN": "学费、账单或退款", vi: "Học phí, hóa đơn hoặc hoàn tiền" },
    answeredBy: "studio",
  },
  {
    id: "progress",
    label: { en: "My child's progress or exams", "zh-CN": "孩子的进度或考试", vi: "Tiến độ hoặc kỳ thi của con" },
    answeredBy: "studio",
  },
  { id: "sign_in", label: { en: "I can't sign in", "zh-CN": "无法登录", vi: "Tôi không đăng nhập được" }, answeredBy: "keystone" },
  {
    id: "bug",
    label: { en: "The app isn't working", "zh-CN": "应用无法正常使用", vi: "Ứng dụng không hoạt động" },
    answeredBy: "keystone",
  },
  {
    id: "privacy",
    label: { en: "My information or privacy", "zh-CN": "我的信息或隐私", vi: "Thông tin của tôi hoặc quyền riêng tư" },
    answeredBy: "keystone",
  },
  {
    id: "security",
    label: { en: "Someone may have got into my account", "zh-CN": "我的账户可能被盗用", vi: "Có thể ai đó đã vào tài khoản của tôi" },
    answeredBy: "keystone",
    urgent: true,
  },
  {
    id: "other",
    label: { en: "Something else about the app", "zh-CN": "关于应用的其他问题", vi: "Vấn đề khác về ứng dụng" },
    answeredBy: "keystone",
  },
];

export function categoriesFor(audience: HelpAudience): SupportCategory[] {
  return audience === "family" ? FAMILY_CATEGORIES : STUDIO_CATEGORIES;
}

export function findCategory(audience: HelpAudience, id: string): SupportCategory | undefined {
  return categoriesFor(audience).find((category) => category.id === id);
}

export const SUPPORT_LIMITS = {
  subjectMax: 120,
  messageMin: 15,
  messageMax: 4000,
  nameMax: 80,
  emailMax: 254,
  pagePathMax: 200,
  suggestedMax: 5,
} as const;

export type SupportRequestInput = {
  audience: HelpAudience;
  category: string;
  subject: string;
  message: string;
  lang?: HelpLang;
  /** Only used when not signed in; signed-in requests use the account's email. */
  contactName?: string;
  contactEmail?: string;
  /** App path the person was on (no query string). */
  pagePath?: string;
  /** Article ids the form suggested before sending, to show which FAQs didn't help. */
  suggestedArticleIds?: string[];
};

export type CleanSupportRequest = Required<
  Omit<SupportRequestInput, "contactName" | "contactEmail">
> & {
  contactName: string | null;
  contactEmail: string | null;
  urgent: boolean;
};

export type SupportValidation =
  | { ok: true; value: CleanSupportRequest }
  | {
      ok: false;
      field: string;
      code: "required" | "too_long" | "too_short" | "invalid" | "ask_studio";
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Strips control characters (keeps newlines and tabs) and trims. */
function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    const control = (code < 32 && char !== "\n" && char !== "\t" && char !== "\r") || code === 127;
    if (!control) out += char;
  }
  return out.trim();
}

/** Keeps only a same-origin path, without query string or hash (they can carry tokens). */
export function cleanPagePath(value: unknown): string {
  const path = clean(value).split(/[?#]/)[0] ?? "";
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  // Invite and intake links carry secrets in the path.
  if (path.startsWith("/join/") || path.startsWith("/intake/") || path.startsWith("/auth/")) {
    return path.split("/").slice(0, 2).join("/") + "/…";
  }
  return path.slice(0, SUPPORT_LIMITS.pagePathMax);
}

/**
 * Validates a support request on both the client and the server. The server is the
 * authority: it runs this again and ignores anything the browser says about identity.
 */
export function validateSupportRequest(
  input: Partial<SupportRequestInput>,
  options: { signedIn: boolean },
): SupportValidation {
  const audience: HelpAudience = input.audience === "family" ? "family" : "studio";
  const category = findCategory(audience, clean(input.category));
  if (!category) return { ok: false, field: "category", code: "required" };
  if (category.answeredBy === "studio") return { ok: false, field: "category", code: "ask_studio" };

  const subject = clean(input.subject).replace(/\s+/g, " ");
  if (!subject) return { ok: false, field: "subject", code: "required" };
  if (subject.length > SUPPORT_LIMITS.subjectMax)
    return { ok: false, field: "subject", code: "too_long" };

  const message = clean(input.message);
  if (!message) return { ok: false, field: "message", code: "required" };
  if (message.length < SUPPORT_LIMITS.messageMin)
    return { ok: false, field: "message", code: "too_short" };
  if (message.length > SUPPORT_LIMITS.messageMax)
    return { ok: false, field: "message", code: "too_long" };

  let contactName: string | null = null;
  let contactEmail: string | null = null;
  if (!options.signedIn) {
    contactName = clean(input.contactName).replace(/\s+/g, " ") || null;
    if (contactName && contactName.length > SUPPORT_LIMITS.nameMax) {
      return { ok: false, field: "contactName", code: "too_long" };
    }
    contactEmail = clean(input.contactEmail).toLowerCase() || null;
    if (!contactEmail) return { ok: false, field: "contactEmail", code: "required" };
    if (contactEmail.length > SUPPORT_LIMITS.emailMax || !EMAIL_RE.test(contactEmail)) {
      return { ok: false, field: "contactEmail", code: "invalid" };
    }
  }

  const suggestedArticleIds = Array.isArray(input.suggestedArticleIds)
    ? [
        ...new Set(
          input.suggestedArticleIds.map(clean).filter((id) => /^[a-z0-9-]{1,60}$/.test(id)),
        ),
      ].slice(0, SUPPORT_LIMITS.suggestedMax)
    : [];

  return {
    ok: true,
    value: {
      audience,
      category: category.id,
      subject,
      message,
      lang: input.lang === "zh-CN" ? "zh-CN" : "en",
      contactName,
      contactEmail,
      pagePath: cleanPagePath(input.pagePath),
      suggestedArticleIds,
      urgent: Boolean(category.urgent),
    },
  };
}

/** Human reference shown to the person and used in email subjects, e.g. KS-7Q4M2D. */
export function newSupportReference(random: () => number = Math.random): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L
  let out = "";
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(random() * alphabet.length)];
  return `KS-${out}`;
}
