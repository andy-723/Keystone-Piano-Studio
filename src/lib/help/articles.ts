/**
 * Help centre articles (in-house FAQ). Written from the app's real screens and from the
 * Keystone legal drafts (MSA v3.2, family app terms v3). Do not describe a feature here
 * until it is live in the app.
 *
 * Studio articles are English only. Family articles carry English and Simplified Chinese,
 * matching the family portal.
 *
 * Body format: paragraphs separated by a blank line; lines starting with "- " are bullets.
 */

export type HelpAudience = "studio" | "family";
export type HelpLang = "en" | "zh-CN";

export type HelpTopic =
  | "getting-started"
  | "students-families"
  | "lessons-teaching"
  | "messages-news"
  | "family-billing"
  | "subscription"
  | "privacy-security"
  | "using-the-app"
  | "lessons-fees";

export type LocalisedText = { en: string; "zh-CN"?: string };

export type HelpArticle = {
  id: string;
  audience: HelpAudience;
  topic: HelpTopic;
  title: LocalisedText;
  body: LocalisedText;
  /** Extra search words, including common misspellings and Chinese terms. */
  keywords: string[];
  /**
   * Family articles only: the studio, not Keystone, answers questions on this subject
   * (lessons, fees, refunds, progress). The help centre offers "Message your teacher".
   */
  studioAnswers?: boolean;
};

export const HELP_TOPICS: Record<HelpTopic, LocalisedText> = {
  "getting-started": { en: "Getting started", "zh-CN": "入门" },
  "students-families": { en: "Students and families" },
  "lessons-teaching": { en: "Lessons and teaching" },
  "messages-news": { en: "Chat and news", "zh-CN": "聊天和新闻" },
  "family-billing": { en: "Invoicing families" },
  subscription: { en: "Your Keystone plan" },
  "privacy-security": { en: "Privacy and security", "zh-CN": "隐私和安全" },
  "using-the-app": { en: "Using the app", "zh-CN": "使用应用" },
  "lessons-fees": { en: "Lessons, fees and progress", "zh-CN": "课程、费用和进度" },
};

export const HELP_ARTICLES: HelpArticle[] = [
  // ---------------------------------------------------------------------------
  // Studio owners, admins and teachers
  // ---------------------------------------------------------------------------
  {
    id: "studio-sign-in",
    audience: "studio",
    topic: "getting-started",
    title: { en: "Signing in and two-step sign-in" },
    body: {
      en: `Sign in with Continue with Google, Continue with Microsoft, or enter your email address and we'll send you a one-time sign-in link. Use the same email address Keystone or your studio owner invited. Open the link on the same device you asked for it on.

Studio owners, admins and teachers must use two-step sign-in. The first time you sign in, scan the QR code with an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password) and save your recovery codes somewhere safe. After that, each sign-in asks for the 6-digit code from the app.

- Lost your phone? Use one of your recovery codes on the code screen.
- No recovery codes either? Send us a support request. We check it's really you, then reset two-step sign-in so you can set it up again.
- We never ask for your authenticator codes or recovery codes.`,
    },
    keywords: [
      "login",
      "log in",
      "password",
      "mfa",
      "2fa",
      "authenticator",
      "otp",
      "code",
      "recovery",
      "locked out",
      "magic link",
      "google",
      "microsoft",
    ],
  },
  {
    id: "studio-new-studio-setup",
    audience: "studio",
    topic: "getting-started",
    title: { en: "Setting up a new studio" },
    body: {
      en: `Studio accounts are set up by the Keystone team. Once your studio is created you get a welcome email. Sign in with that email address, set up your authenticator app, and the new-studio setup opens.

Setup walks you through your studio details, whether you're registered for GST, your lessons and prices, your cancellation policies and how you'd like to add students. Your progress is saved as you go, so you can stop and come back.

When setup is done, the studio checklist on your Today screen shows what's left, such as adding students, setting lesson times, adding your payment details and inviting families.`,
    },
    keywords: [
      "setup",
      "set up",
      "onboarding",
      "welcome email",
      "checklist",
      "start",
      "new account",
      "sign up",
    ],
  },
  {
    id: "studio-enrol-family",
    audience: "studio",
    topic: "students-families",
    title: { en: "Enrolling a student and inviting their family" },
    body: {
      en: `Go to Students and choose Enrol student. Enter the student and their parent or guardian, then send the invite.

The family gets an email from Keystone Music HQ with a link. They confirm the student's details, answer your enrolment questions (about 5 minutes), and accept your studio terms and the Keystone app terms.

You can preview the invite email under Settings, Invite email.`,
    },
    keywords: [
      "enrol",
      "enroll",
      "enrolment",
      "invite",
      "new student",
      "add student",
      "parent",
      "guardian",
      "intake",
    ],
  },
  {
    id: "studio-invite-not-received",
    audience: "studio",
    topic: "students-families",
    title: { en: "A family didn't get their invite, or the link expired" },
    body: {
      en: `Ask the family to check their spam or junk folder. Invites come from an address ending in keystonemusichq.com.

- Check the email address on the student's profile. A typo is the most common cause.
- Invite links expire for security. If the family sees "This link has expired", send the invite again from the student's enrolment screen (Resend).
- The family must sign in with the same email address the invite was sent to. A different address won't find their account.

If the address is right and a fresh invite still doesn't arrive within an hour, send us a support request with the family's email domain (for example gmail.com). Please don't include the student's name or details.`,
    },
    keywords: [
      "invite",
      "email",
      "spam",
      "junk",
      "expired",
      "resend",
      "not received",
      "didn't get",
      "link",
    ],
  },
  {
    id: "studio-import-students",
    audience: "studio",
    topic: "students-families",
    title: { en: "Importing students from a spreadsheet" },
    body: {
      en: `Go to Students and choose Import students. Upload a CSV file (you can save one from Excel, Numbers or Google Sheets).

Keystone checks every row before anything is saved and shows you what needs fixing. Students with the same parent email are grouped into one family, so siblings share one family account. Running the same file twice won't create duplicates.`,
    },
    keywords: [
      "import",
      "csv",
      "spreadsheet",
      "excel",
      "upload",
      "bulk",
      "move from",
      "onebook",
      "migrate",
      "siblings",
    ],
  },
  {
    id: "studio-groups",
    audience: "studio",
    topic: "students-families",
    title: { en: "Student groups" },
    body: {
      en: `Go to Students, then Groups. Groups let you post news to just some families, for example "Exam candidates" or "Tuesday students". A student can be in more than one group.`,
    },
    keywords: ["group", "groups", "class", "category", "tag", "segment"],
  },
  {
    id: "studio-timetable",
    audience: "studio",
    topic: "lessons-teaching",
    title: { en: "Today, the weekly timetable and attendance" },
    body: {
      en: `The Today screen is your day book: today's lessons in order, with Open lesson for each one. Switch to the week view to see the whole timetable.

Inside a lesson you can mark attendance, write lesson notes and send the family a lesson summary. Notes marked shared are visible to the family. Other notes stay private to the studio.

Make-up credits are kept as a running balance for each family. When a make-up is booked, the slot is reserved and the credit used in one step.`,
    },
    keywords: [
      "timetable",
      "schedule",
      "calendar",
      "attendance",
      "mark",
      "absent",
      "lesson notes",
      "summary",
      "make-up",
      "makeup",
      "credit",
      "today",
    ],
  },
  {
    id: "studio-snapshot",
    audience: "studio",
    topic: "using-the-app",
    title: { en: "Studio snapshot for owners and admins" },
    body: {
      en: `Open Snapshot in the main menu. Owners and admins see a week or month view (Australia/Sydney) with tiles for revenue collected, overdue invoices, active students, incomplete enrolment invites, practice at risk, and lessons delivered.

Tap a tile to open the list underneath. Export CSV exports the list you're looking at. Links at the bottom open Invoices and Students. Teachers without owner or admin access stay on Today and don't see whole-studio revenue.`,
    },
    keywords: [
      "snapshot",
      "dashboard",
      "report",
      "revenue",
      "overdue",
      "practice",
      "csv",
      "export",
      "owner",
      "admin",
    ],
  },
  {
    id: "studio-calendar",
    audience: "studio",
    topic: "lessons-teaching",
    title: { en: "Give students lesson times in the Calendar" },
    body: {
      en: `Open Calendar to see your week. Click an empty time, or Add lesson, then choose the student, the day and time, the length, and whether it repeats every week or happens once. Weekly lessons keep going until you stop them or set a last lesson date.

Keystone warns you if the time overlaps another of your lessons. Choose Save anyway if you really do want to double-book.

Click a lesson to change it:
- Move this week only, for one-off swaps.
- Cancel this week, for holidays or sickness. Put back to the usual time undoes it.
- Change day or time from this week on, when a student moves to a new regular slot. Earlier weeks stay as they were.
- Stop weekly lessons, when a student finishes.

Cancelling in the Calendar doesn't give a make-up credit or change invoices yet.

To see your lessons in Google Calendar, choose Connect Google Calendar and sign in to Google. Keystone makes a separate calendar called "Keystone lessons" and keeps it up to date whenever you change a lesson here. It only shows the student's first name and last initial. Keystone can't see or change your other Google calendars, and changes you make in Google aren't copied back, so always change lessons in Keystone. Stop syncing removes Keystone's access; the "Keystone lessons" calendar stays in Google until you delete it there.`,
    },
    keywords: [
      "calendar",
      "google calendar",
      "gcal",
      "schedule",
      "timetable",
      "add student",
      "time slot",
      "weekly",
      "recurring",
      "repeat",
      "move lesson",
      "cancel lesson",
      "sync",
    ],
  },
  {
    id: "studio-library",
    audience: "studio",
    topic: "lessons-teaching",
    title: { en: "Library, courses and grade readiness" },
    body: {
      en: `Open the Library from Settings. It holds course templates for AMEB, Trinity and ABRSM style grades. Copy a template, edit its sections and requirements, then assign it to a student when you enrol them.

As you mark requirements in lessons, the student's grade readiness updates. Families see their child's progress and readiness in their Progress tab, but never your private feedback.`,
    },
    keywords: [
      "library",
      "course",
      "curriculum",
      "syllabus",
      "ameb",
      "trinity",
      "abrsm",
      "grade",
      "exam",
      "readiness",
      "template",
    ],
  },
  {
    id: "studio-chat",
    audience: "studio",
    topic: "messages-news",
    title: { en: "Chatting with families" },
    body: {
      en: `Chat is in-app messaging between your studio and each family. Families can send text, photos, short videos and voice notes. Keystone doesn't send SMS.

If a family writes in Chinese, you can view a translation under their message. The original message is always kept.`,
    },
    keywords: [
      "chat",
      "message",
      "messages",
      "sms",
      "text",
      "photo",
      "video",
      "voice",
      "translate",
      "translation",
      "chinese",
      "unread",
    ],
  },
  {
    id: "studio-news",
    audience: "studio",
    topic: "messages-news",
    title: { en: "Posting studio news" },
    body: {
      en: `Go to News to post an announcement. Choose who sees it: the whole studio, your own students, chosen groups or chosen families. You can save a draft or schedule a post for later.

There are no public comments on posts. A family who wants to reply can message you privately from the post.`,
    },
    keywords: ["news", "announcement", "post", "newsletter", "notice", "schedule", "broadcast"],
  },
  {
    id: "studio-term-invoices",
    audience: "studio",
    topic: "family-billing",
    title: { en: "Sending term invoices to families" },
    body: {
      en: `Go to Invoices and prepare the term's invoices. Keystone counts each student's lessons from your timetable and your state's term calendar, and makes one draft per family. Review the drafts, change anything you need, then send.

- Invoice numbering is locked after your first invoice is sent.
- Under Settings you can choose to attach a PDF to invoice emails and to send payment receipt emails.
- Export for accountant (Settings) gives you a file for your bookkeeper.`,
    },
    keywords: [
      "invoice",
      "invoices",
      "bill",
      "billing",
      "term",
      "fees",
      "draft",
      "send",
      "numbering",
      "pdf",
      "accountant",
      "export",
    ],
  },
  {
    id: "studio-payments",
    audience: "studio",
    topic: "family-billing",
    title: { en: "Recording payments and getting paid" },
    body: {
      en: `Families pay your studio directly. Keystone never receives or holds your families' money.

Families who pay by bank transfer see your payment details on the invoice. When the money arrives, open the invoice and record the payment. Part payments are fine: the balance updates and the invoice shows partially paid.

Online card and direct debit payments go through your own Stripe account, with you as the merchant. Settings, Integrations shows whether Stripe is set up for your studio.`,
    },
    keywords: [
      "payment",
      "paid",
      "bank transfer",
      "stripe",
      "card",
      "direct debit",
      "receipt",
      "partial",
      "balance",
      "mark paid",
    ],
  },
  {
    id: "studio-overdue",
    audience: "studio",
    topic: "family-billing",
    title: { en: "Overdue invoices, reminders and late fees" },
    body: {
      en: `Overdue invoices are flagged on the Invoices screen and reminders can be sent to the family.

Late fees are never added automatically. You set your late fee amount and timing in Settings, Studio terms, and you confirm each late fee before it's added to an invoice.`,
    },
    keywords: ["overdue", "late", "late fee", "reminder", "unpaid", "chase", "debt", "aged"],
  },
  {
    id: "studio-renewals",
    audience: "studio",
    topic: "family-billing",
    title: { en: "Term renewals" },
    body: {
      en: `Under Invoices, Renewals, send each family a renewal request for the next term. Families answer in the app: keep current lesson times, discuss a change, or not continue. You can send reminders to families who haven't replied.`,
    },
    keywords: ["renewal", "renew", "next term", "re-enrol", "continue", "reminder"],
  },
  {
    id: "studio-gst",
    audience: "studio",
    topic: "family-billing",
    title: { en: "GST on family invoices" },
    body: {
      en: `Turn Registered for GST on or off in Settings. The setting applies to draft invoices. Invoices you've already sent keep the GST and title they were sent with, so changing the setting never rewrites an old invoice.`,
    },
    keywords: ["gst", "tax", "abn", "tax invoice", "registered"],
  },
  {
    id: "studio-studio-terms",
    audience: "studio",
    topic: "students-families",
    title: { en: "Your studio terms" },
    body: {
      en: `Settings, Studio terms is where you set your own terms for families: fees, cancellations, make-ups, consents and your privacy policy. Families accept them when they enrol. When you publish a new version, it appears in the version history, you can see which families have accepted it, and you can remind those who haven't.

Your studio terms are your agreement with each family. Keystone provides a template but isn't a party to it, and the template isn't legal advice.`,
    },
    keywords: [
      "terms",
      "policy",
      "agreement",
      "cancellation",
      "consent",
      "privacy policy",
      "contract",
      "accept",
    ],
  },
  {
    id: "studio-plans",
    audience: "studio",
    topic: "subscription",
    title: { en: "Base and Pro plans" },
    body: {
      en: `Base is A$29 a month and includes up to 35 active students. Pro is A$49 a month with no limit on active students, and adds billing automation, Xero sync, video lessons and the review queue, Red Risk alerts and exam board rules. GST is added only while Keystone is registered for GST.

One subscription covers your whole studio, including all your teachers. You can see and change your plan under Settings, Plan and billing. Moving from Pro to Base never deletes anything: Pro features switch off and your data stays.`,
    },
    keywords: [
      "plan",
      "pricing",
      "price",
      "cost",
      "base",
      "pro",
      "upgrade",
      "downgrade",
      "subscription",
      "students limit",
      "35",
    ],
  },
  {
    id: "studio-billing-paused",
    audience: "studio",
    topic: "subscription",
    title: { en: "Failed payments, paused studios and cancelling" },
    body: {
      en: `If a payment for your Keystone plan fails, we retry and remind you by email and in the app. Your studio keeps working while you sort it out.

If the fees stay unpaid for 14 days after a reminder, the studio is paused. While paused, the owner can still sign in and read and export the studio's records, but teachers and families can't use the app until the payment is made.

To cancel, send us a support request and choose "My Keystone plan or bill". After cancelling, the owner has 30 days to export the studio's records.`,
    },
    keywords: [
      "failed payment",
      "card declined",
      "paused",
      "suspended",
      "locked",
      "read only",
      "cancel",
      "cancellation",
      "export",
      "refund",
      "invoice from keystone",
    ],
  },
  {
    id: "studio-data-location",
    audience: "studio",
    topic: "privacy-security",
    title: { en: "Where your studio's data is kept" },
    body: {
      en: `Keystone's database and file storage, including photos, audio and video, are in Australia (Sydney), with a nightly encrypted backup in Melbourne. A few suppliers, such as email delivery, process limited information overseas.

You control your studio's records. Keystone handles them only to provide and support the app. Each studio's records are kept separate from every other studio's at the database level.`,
    },
    keywords: [
      "data",
      "where",
      "australia",
      "sydney",
      "hosted",
      "backup",
      "privacy",
      "security",
      "overseas",
      "sovereignty",
    ],
  },
  {
    id: "studio-support-access",
    audience: "studio",
    topic: "privacy-security",
    title: { en: "Can Keystone see my families' records?" },
    body: {
      en: `Keystone support can see your account and billing details. Keystone staff don't have access to your families, students, invoices or chat from the support console. If we ever need to look at your studio's records to fix a problem, we ask the owner first.

That's also why support requests should describe the problem without student names, dates of birth or other child details.`,
    },
    keywords: ["access", "support access", "staff", "who can see", "privacy", "confidential"],
  },
  {
    id: "studio-security-concern",
    audience: "studio",
    topic: "privacy-security",
    title: { en: "Reporting a security or privacy concern" },
    body: {
      en: `If you think someone has got into your account, a family can see something they shouldn't, or data may have been lost, send a support request and choose "Security or privacy concern". These are flagged urgent.

While you wait, sign out on any shared devices.`,
    },
    keywords: [
      "security",
      "breach",
      "hacked",
      "compromised",
      "privacy",
      "leak",
      "wrong family",
      "urgent",
      "phishing",
    ],
  },

  // ---------------------------------------------------------------------------
  // Families (English + Simplified Chinese)
  // ---------------------------------------------------------------------------
  {
    id: "family-join",
    audience: "family",
    topic: "using-the-app",
    title: { en: "Joining from your invite email", "zh-CN": "通过邀请邮件加入" },
    body: {
      en: `Your studio sends you an invite email from Keystone Music HQ. Open the link, confirm your child's details, answer the studio's questions (about 5 minutes) and accept the terms. Then sign in with the same email address.

If the link says it has expired, ask your teacher to send a new one.`,
      "zh-CN": `您的音乐工作室会通过 Keystone Music HQ 给您发送邀请邮件。打开链接，确认孩子的资料，回答工作室的问题（约 5 分钟），并接受条款。然后用同一个邮箱地址登录。

如果链接显示已过期，请让老师重新发送。`,
    },
    keywords: [
      "invite",
      "join",
      "enrol",
      "link",
      "expired",
      "email",
      "邀请",
      "加入",
      "报名",
      "链接",
      "过期",
    ],
  },
  {
    id: "family-sign-in",
    audience: "family",
    topic: "using-the-app",
    title: { en: "Signing in", "zh-CN": "登录" },
    body: {
      en: `Use Continue with Google, Continue with Microsoft, or enter your email address to get a one-time sign-in link. Always use the email address your studio's invite was sent to. Open the link on the same device.

- Nothing arrived? Check your spam or junk folder.
- "We couldn't find an account"? You're probably using a different email address from the one the invite went to.
- Want extra security? You can turn on two-step sign-in with an authenticator app. It's optional for families.`,
      "zh-CN": `可以选择「使用 Google 继续」、「使用 Microsoft 继续」，或输入邮箱地址获取一次性登录链接。请始终使用工作室邀请邮件所发送到的邮箱地址，并在同一台设备上打开链接。

- 没收到邮件？请查看垃圾邮件文件夹。
- 提示「找不到账户」？您可能使用了与邀请邮件不同的邮箱地址。
- 想更安全？可以用身份验证器应用开启两步登录。家庭用户可自愿选择。`,
    },
    keywords: [
      "login",
      "log in",
      "sign in",
      "password",
      "account",
      "spam",
      "authenticator",
      "登录",
      "密码",
      "账户",
      "账号",
      "垃圾邮件",
      "验证",
    ],
  },
  {
    id: "family-language",
    audience: "family",
    topic: "using-the-app",
    title: { en: "Changing the language", "zh-CN": "切换语言" },
    body: {
      en: `Tap EN or 中文 at the top of the family portal to switch between English and Chinese.`,
      "zh-CN": `在家庭页面顶部点击 EN 或「中文」，即可在英文和中文之间切换。`,
    },
    keywords: ["language", "chinese", "english", "translate", "语言", "中文", "英文", "翻译"],
  },
  {
    id: "family-chat",
    audience: "family",
    topic: "using-the-app",
    title: { en: "Messaging your teacher", "zh-CN": "给老师发消息" },
    body: {
      en: `Open the Chat tab to message your teacher. You can send text, a photo or video, or a voice note. Keystone doesn't send SMS, so check the app for replies.`,
      "zh-CN": `打开「聊天」标签即可给老师发消息。可以发送文字、照片、视频或语音留言。Keystone 不发送短信，请在应用中查看老师的回复。`,
    },
    keywords: [
      "chat",
      "message",
      "teacher",
      "photo",
      "video",
      "voice",
      "sms",
      "聊天",
      "消息",
      "老师",
      "照片",
      "视频",
      "语音",
      "短信",
    ],
  },
  {
    id: "family-news",
    audience: "family",
    topic: "using-the-app",
    title: { en: "Studio news", "zh-CN": "工作室新闻" },
    body: {
      en: `The News tab shows announcements from your studio, such as concerts, holidays and exam dates. To ask about a post, use the message button on the post. It opens a private chat with your teacher.`,
      "zh-CN": `「新闻」标签显示工作室的公告，例如音乐会、假期和考试日期。如对某条公告有疑问，请点击公告上的消息按钮，与老师私下聊天。`,
    },
    keywords: ["news", "announcement", "concert", "holiday", "新闻", "公告", "音乐会", "假期"],
  },
  {
    id: "family-lessons",
    audience: "family",
    topic: "lessons-fees",
    studioAnswers: true,
    title: { en: "Lesson times, cancellations and make-ups", "zh-CN": "上课时间、取消和补课" },
    body: {
      en: `Your next lesson is on the Home tab. Lesson times, cancellations and make-up lessons are set by your studio under its own terms, so please ask your teacher in Chat.

If your teacher offers make-ups, you'll see how many make-up lessons you're owed and a Request a make-up button.`,
      "zh-CN": `「首页」标签显示下一节课。上课时间、取消和补课由工作室按其条款决定，请在「聊天」中询问老师。

如果老师提供补课，您会看到欠补的课时数量和「申请补课」按钮。`,
    },
    keywords: [
      "lesson",
      "time",
      "reschedule",
      "cancel",
      "sick",
      "absent",
      "make-up",
      "makeup",
      "holiday",
      "课程",
      "上课",
      "时间",
      "改期",
      "取消",
      "请假",
      "补课",
    ],
  },
  {
    id: "family-invoices",
    audience: "family",
    topic: "lessons-fees",
    studioAnswers: true,
    title: { en: "Invoices and paying your studio", "zh-CN": "账单和付款" },
    body: {
      en: `You pay your studio, not Keystone. Keystone never receives or holds your payments and never sees full card numbers.

Open the Invoices tab to see each invoice. If you pay by bank transfer, tap View payment details for the account and reference to use. Your teacher marks the invoice paid when the money arrives.

To ask about an invoice, tap Question this invoice. Your question goes to your teacher.`,
      "zh-CN": `您是向工作室付款，而不是向 Keystone 付款。Keystone 不会收取或持有您的款项，也看不到完整的银行卡号。

打开「账单」标签查看每张账单。如果通过银行转账付款，请点击「查看付款信息」获取账户和付款备注。款项到账后，老师会将账单标记为已付。

如对账单有疑问，请点击「对此账单提问」，问题会发送给老师。`,
    },
    keywords: [
      "invoice",
      "bill",
      "pay",
      "payment",
      "bank transfer",
      "card",
      "receipt",
      "paid",
      "账单",
      "发票",
      "付款",
      "支付",
      "转账",
      "收据",
    ],
  },
  {
    id: "family-fees-refunds",
    audience: "family",
    topic: "lessons-fees",
    studioAnswers: true,
    title: { en: "Fees, refunds and late fees", "zh-CN": "学费、退款和滞纳金" },
    body: {
      en: `Fees, refunds, discounts and late fees are decided by your studio under the studio terms you accepted when you enrolled. Please ask your teacher.

If you think the app made a technical mistake, such as a wrong invoice amount, tell your teacher or send Keystone a support request and we'll look into the app's part in it.`,
      "zh-CN": `学费、退款、折扣和滞纳金由工作室根据您报名时接受的工作室条款决定。请询问老师。

如果您认为是应用出现了技术错误（例如账单金额不对），请告诉老师，或向 Keystone 提交支持请求，我们会调查应用方面的原因。`,
    },
    keywords: [
      "fee",
      "fees",
      "refund",
      "discount",
      "late fee",
      "price",
      "cost",
      "学费",
      "费用",
      "退款",
      "折扣",
      "滞纳金",
      "价格",
    ],
  },
  {
    id: "family-renewal",
    audience: "family",
    topic: "lessons-fees",
    studioAnswers: true,
    title: { en: "Answering a term renewal", "zh-CN": "回复下学期续课" },
    body: {
      en: `Before each term your studio may ask whether you'd like to continue. Answer on the Home tab: keep your current lesson times, ask to discuss a change, or let your teacher know you won't continue. You can add a note for your teacher.`,
      "zh-CN": `每学期开始前，工作室可能会询问您是否继续上课。请在「首页」回复：保留现有上课时间、希望讨论调整，或告知老师下学期不再继续。您也可以给老师留言。`,
    },
    keywords: [
      "renewal",
      "renew",
      "next term",
      "continue",
      "stop",
      "续课",
      "续报",
      "下学期",
      "继续",
      "停课",
    ],
  },
  {
    id: "family-progress",
    audience: "family",
    topic: "lessons-fees",
    studioAnswers: true,
    title: { en: "Progress and logging practice", "zh-CN": "学习进度和练琴记录" },
    body: {
      en: `The Progress tab shows your child's grade requirements, what's been passed and their grade readiness. Tap Log practice to record practice minutes. Minutes your teacher adds are shown separately.

Questions about your child's progress or exams are best asked in Chat with your teacher.`,
      "zh-CN": `「进度」标签显示孩子的考级要求、已通过的项目和考级准备程度。点击「记录练琴」可以登记练琴分钟数。老师添加的分钟数会单独显示。

关于孩子学习进度或考试的问题，请在「聊天」中询问老师。`,
    },
    keywords: [
      "progress",
      "practice",
      "minutes",
      "exam",
      "grade",
      "ameb",
      "readiness",
      "进度",
      "练琴",
      "练习",
      "分钟",
      "考级",
      "考试",
    ],
  },
  {
    id: "family-agreements",
    audience: "family",
    topic: "privacy-security",
    title: { en: "Your two agreements", "zh-CN": "您的两份协议" },
    body: {
      en: `Your family has two agreements. One is with your studio, for lessons, fees and cancellations. The other is with Keystone, for using the app and how Keystone handles your information.

Keystone looks after the app: sign-in problems, technical errors and suspected account misuse. Your studio looks after lessons, fees, refunds and decisions about your child's lesson records.`,
      "zh-CN": `您的家庭有两份协议。一份与工作室签订，涉及课程、学费和取消政策。另一份与 Keystone 签订，涉及应用的使用以及 Keystone 如何处理您的信息。

Keystone 负责应用本身：登录问题、技术错误和疑似账户被盗用。工作室负责课程、学费、退款以及孩子学习记录的相关决定。`,
    },
    keywords: [
      "terms",
      "agreement",
      "contract",
      "who",
      "responsible",
      "条款",
      "协议",
      "合同",
      "负责",
    ],
  },
  {
    id: "family-privacy",
    audience: "family",
    topic: "privacy-security",
    title: { en: "Your family's information", "zh-CN": "您家庭的信息" },
    body: {
      en: `Keystone stores information in Australia (Sydney), with a nightly encrypted backup in Melbourne. We don't sell personal information, show advertising, or use children's information for advertising or profiling.

Your child's lesson records belong to your studio. To get a copy of the information Keystone holds about you, correct it, or close your login, send Keystone a support request and choose "My information or privacy". Closing your login doesn't end your agreement with your studio.`,
      "zh-CN": `Keystone 将信息存储在澳大利亚（悉尼），并每晚在墨尔本进行加密备份。我们不出售个人信息，不展示广告，也不会将儿童信息用于广告或用户画像。

孩子的学习记录属于工作室。如需获取 Keystone 持有的您的信息副本、更正信息或注销登录，请向 Keystone 提交支持请求，并选择「我的信息或隐私」。注销登录不会终止您与工作室的协议。`,
    },
    keywords: [
      "privacy",
      "data",
      "information",
      "delete",
      "close account",
      "copy",
      "australia",
      "隐私",
      "数据",
      "信息",
      "删除",
      "注销",
      "副本",
    ],
  },
];

export function articleText(text: LocalisedText, lang: HelpLang): string {
  return (lang === "zh-CN" ? text["zh-CN"] : undefined) ?? text.en;
}

export function articlesFor(audience: HelpAudience): HelpArticle[] {
  return HELP_ARTICLES.filter((article) => article.audience === audience);
}

export function findArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.id === id);
}
