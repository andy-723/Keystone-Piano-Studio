import type { Lang } from "@/mocks/types";
import type { TourId } from "@/services/tour";

export type TourText = { en: string; "zh-CN"?: string };
export type FamilyView = "news" | "home" | "chat" | "progress" | "invoices";

export type TourStep = {
  id: string;
  /** data-tour value of the element to highlight; null shows a centred card. */
  target: string | null;
  /** Studio tour: route to open before highlighting. Omitted = stay where the person is. */
  route?: string;
  /** Family tour: portal tab to open before highlighting. */
  view?: FamilyView;
  title: TourText;
  body: TourText;
  /** Last step only: offer another tour instead of a plain Finish. */
  offer?: { accept: TourText; decline: TourText; starts: TourId };
};

export function tourText(text: TourText, lang: Lang): string {
  return (lang === "zh-CN" ? text["zh-CN"] : undefined) ?? text.en;
}

/** For studio owners and teachers. Every target is a data-tour attribute on an existing screen. */
export const STUDIO_TOUR: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: { en: "Welcome to Keystone Music HQ" },
    body: {
      en: "This 3-minute tour follows the order you'll set up your studio: your details, terms and privacy, invoicing, enrolling students, courses, news and chat. Skip it any time and replay it from the ? button.",
    },
  },
  {
    id: "details",
    target: "settings-profile",
    route: "/settings",
    title: { en: "Your studio details" },
    body: {
      en: "Start in Settings. Add your name, photo and Working with Children Check here. Your studio name and GST registration are further down the page.",
    },
  },
  {
    id: "terms",
    target: "terms-studio-details",
    route: "/settings/terms",
    title: { en: "Your studio terms" },
    body: {
      en: "Fill in your legal name, ABN, fees and cancellation rules. Keystone builds your studio agreement from them, and families accept it when they enrol.",
    },
  },
  {
    id: "privacy",
    target: "terms-privacy",
    route: "/settings/terms",
    title: { en: "Privacy" },
    body: {
      en: "This shows where Keystone stores family data and how long records are kept. Your privacy email goes in Studio details above, and your privacy policy PDF downloads from the top of the page.",
    },
  },
  {
    id: "payments",
    target: "settings-payment-details",
    route: "/settings",
    title: { en: "How families pay you" },
    body: {
      en: "Add your bank details so they print on every invoice. Further down, connect Stripe for online payments and Xero (Pro plan) for your books.",
    },
  },
  {
    id: "invoices",
    target: "invoices-actions",
    route: "/invoices",
    title: { en: "Invoices" },
    body: {
      en: "Make a one-off invoice, or bill next term for every family at once. Keystone counts the lessons and leaves out public holidays.",
    },
  },
  {
    id: "enrol",
    target: "enrol-student",
    route: "/students",
    title: { en: "Enrol a family" },
    body: {
      en: "Add a student and their family. Keystone sends the family an invite and a short intake form, and opens a private chat with them. Groups, next to it, let news reach the right families.",
    },
  },
  {
    id: "courses",
    target: "library-tabs",
    route: "/library",
    title: { en: "Course templates" },
    body: {
      en: "Your Library (Settings, then Open library) holds course templates. Start a new course or copy one of ours, set the sections and pieces (weights add up to 100%), then Assign to students.",
    },
  },
  {
    id: "news",
    target: "news-new-post",
    route: "/news",
    title: { en: "Share studio news" },
    body: { en: "Post news to the whole studio, your own students or a group." },
  },
  {
    id: "chat",
    target: "chat-family-list",
    route: "/chat",
    title: { en: "Chat with families" },
    body: {
      en: "Every enrolled family has its own private chat with the studio. Families get an alert when you write.",
    },
  },
  {
    id: "offer-setup",
    target: "settings-profile",
    route: "/settings",
    title: { en: "Ready to set up your studio?" },
    body: {
      en: "That's everything. Want a hand filling in your studio details, terms and payment details now? It walks you through each part, and you can stop any time.",
    },
    offer: { accept: { en: "Yes, help me" }, decline: { en: "Not now" }, starts: "setup" },
  },
];

/**
 * Offered at the end of the studio tour: walks an owner through the parts they fill in before
 * enrolling anyone. Never auto-starts; replay comes from the end of the studio tour.
 */
export const SETUP_TOUR: TourStep[] = [
  {
    id: "setup-profile",
    target: "settings-profile",
    route: "/settings",
    title: { en: "1. Your profile" },
    body: {
      en: "Type your name as families should see it, add a photo, and enter your Working with Children Check. Press Save profile, then Next.",
    },
  },
  {
    id: "setup-terms-details",
    target: "terms-studio-details",
    route: "/settings/terms",
    title: { en: "2. Studio details for your terms" },
    body: {
      en: "Enter your legal name, trading name, ABN, address, email, phone and privacy email. Each field saves when you move to the next one.",
    },
  },
  {
    id: "setup-terms-billing",
    target: "terms-billing",
    route: "/settings/terms",
    title: { en: "3. Billing rules" },
    body: {
      en: "Choose how often you bill, when invoices are due, any late fee, and how many weeks' notice a family gives to stop lessons.",
    },
  },
  {
    id: "setup-terms-lessons",
    target: "terms-lessons",
    route: "/settings/terms",
    title: { en: "4. Cancellations and make-ups" },
    body: {
      en: "Set the cancellation notice and how many make-up lessons a family gets. Anything still missing is listed in red here.",
    },
  },
  {
    id: "setup-privacy",
    target: "terms-privacy",
    route: "/settings/terms",
    title: { en: "5. Privacy and extra terms" },
    body: {
      en: "Read how family data is stored. Add any extra terms of your own in the box here; Keystone warns you if the wording needs a second look.",
    },
  },
  {
    id: "setup-publish",
    target: "terms-publish",
    route: "/settings/terms",
    title: { en: "6. Publish your terms" },
    body: {
      en: "Check the live preview above, add a short summary and publish. New families accept this version when they enrol.",
    },
  },
  {
    id: "setup-payments",
    target: "settings-payment-details",
    route: "/settings",
    title: { en: "7. Your bank details" },
    body: {
      en: "Enter the account name, BSB and account number (or PayID) for invoices, then Save payment details.",
    },
  },
  {
    id: "setup-done",
    target: null,
    title: { en: "Your studio is set up" },
    body: {
      en: "Next, enrol your first family from Students. The ? button at the top replays the studio tour.",
    },
  },
];

/** For guardians in the family portal, in English and Simplified Chinese. */
export const FAMILY_TOUR: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: { en: "Welcome to your family portal", "zh-CN": "欢迎使用家庭门户" },
    body: {
      en: "A quick look at where to find news, lessons, messages and invoices. It takes about a minute.",
      "zh-CN": "快速了解在哪里查看动态、课程、消息和账单，大约需要一分钟。",
    },
  },
  {
    id: "news",
    target: "family-tab-news",
    view: "news",
    title: { en: "Studio news", "zh-CN": "工作室动态" },
    body: {
      en: "Announcements from your teacher appear here. Tap Got it so they know you've read it.",
      "zh-CN": "老师发布的通知会显示在这里。点击“知道了”，让老师知道您已阅读。",
    },
  },
  {
    id: "home",
    target: "family-tab-home",
    view: "home",
    title: { en: "Home", "zh-CN": "首页" },
    body: {
      en: "Your next lesson, this week's practice and anything that needs you.",
      "zh-CN": "查看下一节课、本周练习以及需要您处理的事项。",
    },
  },
  {
    id: "chat",
    target: "family-tab-chat",
    view: "chat",
    title: { en: "Message your teacher", "zh-CN": "给老师发消息" },
    body: {
      en: "Send messages, photos and voice notes to your teacher. Only your family and the studio can see them.",
      "zh-CN": "直接向老师发送文字、照片和语音。只有您的家庭和工作室能看到。",
    },
  },
  {
    id: "progress",
    target: "family-tab-progress",
    view: "progress",
    title: { en: "Progress", "zh-CN": "学习进度" },
    body: {
      en: "See how your child is going in each part of their course, and log practice.",
      "zh-CN": "查看孩子在课程各部分的进展，并记录练习时间。",
    },
  },
  {
    id: "invoices",
    target: "family-tab-invoices",
    view: "invoices",
    title: { en: "Invoices", "zh-CN": "账单" },
    body: {
      en: "View your invoices, and pay online if your studio has it turned on.",
      "zh-CN": "查看账单；如果工作室已开通，还可以在线付款。",
    },
  },
  {
    id: "language",
    target: "family-language",
    title: { en: "English or 中文", "zh-CN": "English 或 中文" },
    body: {
      en: "Switch language any time. The whole portal follows your choice.",
      "zh-CN": "随时切换语言，整个门户都会使用您选择的语言。",
    },
  },
  {
    id: "done",
    target: null,
    title: { en: "All set", "zh-CN": "完成" },
    body: {
      en: "Replay this tour any time from the ? button at the top.",
      "zh-CN": "随时可以点击顶部的 ? 按钮重新查看本导览。",
    },
  },
];

export const TOURS: Record<TourId, TourStep[]> = {
  studio: STUDIO_TOUR,
  family: FAMILY_TOUR,
  setup: SETUP_TOUR,
};

type ControlKey =
  "start" | "notNow" | "next" | "back" | "skip" | "finish" | "replay" | "stepOf" | "label";
const CONTROLS: Record<ControlKey, TourText> = {
  start: { en: "Start tour", "zh-CN": "开始导览" },
  notNow: { en: "Not now", "zh-CN": "以后再说" },
  next: { en: "Next", "zh-CN": "下一步" },
  back: { en: "Back", "zh-CN": "上一步" },
  skip: { en: "Skip tour", "zh-CN": "跳过导览" },
  finish: { en: "Finish", "zh-CN": "完成" },
  replay: { en: "Take the tour", "zh-CN": "查看导览" },
  stepOf: { en: "Step {n} of {total}", "zh-CN": "第 {n} 步，共 {total} 步" },
  label: { en: "Guided tour", "zh-CN": "导览" },
};

export function tourControl(
  key: ControlKey,
  lang: Lang,
  values: Record<string, number> = {},
): string {
  let text = tourText(CONTROLS[key], lang);
  for (const [name, value] of Object.entries(values))
    text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
