import type { HelpLang } from "./articles";

const en = {
  helpCentre: "Help centre",
  searchLabel: "Search help",
  searchPlaceholder: "Type a question, e.g. how do I resend an invite",
  noResults: "No articles match that. Try other words, or send us a request below.",
  resultsFor: "Articles that might help",
  browse: "Browse by topic",
  askStudioTitle: "Your studio answers this one",
  askStudioBody:
    "Lessons, fees, refunds and progress are set by your studio, so your teacher is the quickest way to an answer.",
  messageTeacher: "Message your teacher",
  askStudioSignedOut:
    "Sign in and open Chat to message your teacher, or contact your studio directly.",
  stillNeedHelp: "Still need help?",
  stillNeedHelpBody: "Send the Keystone team a request. We aim to reply within one business day.",
  category: "What's it about?",
  categoryPlaceholder: "Choose a topic",
  subject: "Subject",
  message: "Describe the problem",
  messageHint: "What were you trying to do, and what happened instead?",
  privacyNote:
    "Please don't include students' names, dates of birth or other personal details, or any passwords or codes. We'll ask if we need more.",
  suggestionsTitle: "Before you send, these might answer it:",
  name: "Your name (optional)",
  email: "Your email address",
  emailHint: "We'll reply to this address.",
  send: "Send request",
  sending: "Sending…",
  sentTitle: "Request sent",
  sentBody:
    "Your reference is {reference}. We've emailed you a copy and aim to reply within one business day.",
  sentUrgent: "Security concerns are looked at first.",
  another: "Send another request",
  readMore: "Read",
  urgentNote: "Marked urgent. We look at security concerns first.",
  errors_required: "Please fill this in.",
  errors_too_long: "That's too long. Please shorten it.",
  errors_too_short: "Please add a little more detail.",
  errors_invalid: "Please check this.",
  errors_captcha: "Please complete the security check.",
  errors_rate_limited:
    "You've sent a few requests in a short time. Please wait 15 minutes and try again.",
  errors_unauthorized: "Your sign-in has expired. Please sign in again and resend.",
  errors_failed: "We couldn't send your request. Please try again, or email us at {email}.",
  errors_ask_studio: "Please ask your studio about this one.",
  help: "Help",
  back: "Back",
};

const zh: typeof en = {
  helpCentre: "帮助中心",
  searchLabel: "搜索帮助",
  searchPlaceholder: "输入您的问题，例如：如何付款",
  noResults: "没有找到相关文章。请换个说法，或在下方给我们发送请求。",
  resultsFor: "可能有帮助的文章",
  browse: "按主题浏览",
  askStudioTitle: "这个问题由您的工作室解答",
  askStudioBody: "课程、学费、退款和学习进度由工作室决定，直接问老师最快。",
  messageTeacher: "给老师发消息",
  askStudioSignedOut: "请登录后在「聊天」中联系老师，或直接联系您的工作室。",
  stillNeedHelp: "仍需要帮助？",
  stillNeedHelpBody: "向 Keystone 团队发送请求。我们一般会在一个工作日内回复。",
  category: "关于什么问题？",
  categoryPlaceholder: "选择一个主题",
  subject: "标题",
  message: "描述问题",
  messageHint: "您想做什么？实际发生了什么？",
  privacyNote:
    "请不要填写学生的姓名、出生日期或其他个人信息，也不要填写任何密码或验证码。如需更多信息，我们会再询问。",
  suggestionsTitle: "发送前，这些文章或许能解答：",
  name: "您的姓名（选填）",
  email: "您的邮箱地址",
  emailHint: "我们会回复到这个邮箱。",
  send: "发送请求",
  sending: "正在发送…",
  sentTitle: "请求已发送",
  sentBody: "您的编号是 {reference}。我们已给您发送确认邮件，一般会在一个工作日内回复。",
  sentUrgent: "安全问题会优先处理。",
  another: "再发送一个请求",
  readMore: "阅读",
  urgentNote: "已标记为紧急。安全问题会优先处理。",
  errors_required: "请填写此项。",
  errors_too_long: "内容太长，请缩短。",
  errors_too_short: "请再补充一些细节。",
  errors_invalid: "请检查此项。",
  errors_captcha: "请完成安全验证。",
  errors_rate_limited: "您在短时间内发送了多个请求。请 15 分钟后再试。",
  errors_unauthorized: "登录已过期。请重新登录后再发送。",
  errors_failed: "请求发送失败。请重试，或发邮件至 {email}。",
  errors_ask_studio: "这个问题请联系您的工作室。",
  help: "帮助",
  back: "返回",
};

export type HelpUiKey = keyof typeof en;

export function helpText(
  lang: HelpLang,
  key: HelpUiKey,
  values: Record<string, string> = {},
): string {
  let text = (lang === "zh-CN" ? zh : en)[key];
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, value);
  return text;
}
