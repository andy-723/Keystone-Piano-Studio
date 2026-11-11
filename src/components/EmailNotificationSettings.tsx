/**
 * Email notification switches (0018): chat, news and teacher feedback. Each person's own row in
 * notification_preference, read and saved with their own session (RLS). Demo mode keeps the
 * switches on the page only.
 */
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { getAuthClient } from "@/lib/auth-client";
import { toast } from "sonner";

type Prefs = { chat_email: boolean; news_email: boolean; marking_email: boolean };
const DEFAULTS: Prefs = { chat_email: true, news_email: true, marking_email: true };

const TEXT = {
  en: {
    title: "Email notifications",
    intro:
      "We email you when something is waiting in Keystone. Emails say who wrote, never what they wrote, and nothing is sent between 9pm and 7am.",
    chat: "Unread chat messages",
    chatHint: "Once a chat has been unread for 15 minutes. One email until you read it.",
    news: "News posts",
    newsHint: "Important posts straight away; others in a 7am daily update.",
    marking: "Teacher feedback",
    markingHint: "New feedback shared with your family, in the 7am daily update.",
    staffChatHint:
      "When a family's message has been unread for 15 minutes. One email per chat until someone reads it.",
    saved: "Email settings saved.",
    failed: "Couldn't save your email settings. Please try again.",
    demo: "Demo: these switches aren't saved.",
  },
  "zh-CN": {
    title: "邮件提醒",
    intro:
      "当 Keystone 中有新内容时，我们会发邮件提醒您。邮件只说明是谁发来的，不包含内容；晚上 9 点到早上 7 点不发送。",
    chat: "未读聊天消息",
    chatHint: "聊天未读 15 分钟后提醒一次，阅读前不会重复发送。",
    news: "工作室通知",
    newsHint: "重要通知立即发送，其他通知在早上 7 点的每日更新中发送。",
    marking: "老师反馈",
    markingHint: "老师分享给您家庭的新反馈，在早上 7 点的每日更新中发送。",
    staffChatHint: "",
    saved: "邮件设置已保存。",
    failed: "无法保存邮件设置，请重试。",
    demo: "演示模式：这些设置不会保存。",
  },
} as const;

async function currentUserId(): Promise<string | null> {
  const client = getAuthClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}

export function EmailNotificationSettings({
  audience,
  lang = "en",
}: {
  audience: "studio" | "family";
  lang?: string;
}) {
  const t = TEXT[lang === "zh-CN" ? "zh-CN" : "en"];
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const id = await currentUserId();
      if (cancelled || !id) return;
      setUserId(id);
      const { data } = await getAuthClient()!
        .from("notification_preference")
        .select("chat_email, news_email, marking_email")
        .eq("user_id", id)
        .maybeSingle();
      if (!cancelled && data) setPrefs(data as Prefs);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(key: keyof Prefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (!userId) return;
    setSaving(true);
    const { error } = await getAuthClient()!
      .from("notification_preference")
      .upsert({ user_id: userId, ...next }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      setPrefs(prefs);
      toast.error(t.failed);
    } else toast.success(t.saved);
  }

  const rows: Array<{ key: keyof Prefs; label: string; hint: string }> =
    audience === "studio"
      ? [{ key: "chat_email", label: t.chat, hint: t.staffChatHint || t.chatHint }]
      : [
          { key: "chat_email", label: t.chat, hint: t.chatHint },
          { key: "news_email", label: t.news, hint: t.newsHint },
          { key: "marking_email", label: t.marking, hint: t.markingHint },
        ];

  return (
    <section className="border-b border-border py-6" id="email-notifications" data-no-translate>
      <h2 className="text-2xl font-semibold">{t.title}</h2>
      <p className="mt-3 text-base text-muted-foreground">{t.intro}</p>
      {!userId && <p className="mt-2 text-sm text-muted-foreground">{t.demo}</p>}
      <div className="mt-4 divide-y divide-border">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-5 py-4">
            <label htmlFor={`notify-${row.key}`} className="flex-1">
              <span className="block font-semibold">{row.label}</span>
              <span className="block text-sm text-muted-foreground">{row.hint}</span>
            </label>
            <Switch
              id={`notify-${row.key}`}
              checked={prefs[row.key]}
              disabled={saving}
              onCheckedChange={(value) => void change(row.key, value)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
