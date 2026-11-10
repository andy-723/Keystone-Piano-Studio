import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PublicPage, publicSupportEmail } from "@/components/public/PublicPage";
import { HelpCentre } from "@/components/help/HelpCentre";
import { Button } from "@/components/ui/button";
import type { HelpLang } from "@/lib/help/articles";

type HelpSearch = { for?: "studio" | "family" };

export const Route = createFileRoute("/help")({
  validateSearch: (search: Record<string, unknown>): HelpSearch =>
    search["for"] === "family" || search["for"] === "studio" ? { for: search["for"] } : {},
  head: () => ({ meta: [{ title: "Help centre — Keystone Music HQ" }] }),
  component: HelpPage,
});

/**
 * Public help centre: no session, no studio data. Studios and families each get their own
 * FAQ (families in English or Chinese) and a signed-out support form with a security check.
 */
function HelpPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/help" });
  const audience = search.for ?? "studio";
  const [lang, setLang] = useState<HelpLang>("en");
  const email = publicSupportEmail();

  return (
    <PublicPage title={audience === "family" && lang === "zh-CN" ? "帮助中心" : "Help centre"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Who is this help for?" className="flex flex-wrap gap-2">
          <Button
            variant={audience === "studio" ? "default" : "outline"}
            aria-pressed={audience === "studio"}
            className="min-h-11"
            onClick={() => void navigate({ search: { for: "studio" } })}
          >
            Studios and teachers
          </Button>
          <Button
            variant={audience === "family" ? "default" : "outline"}
            aria-pressed={audience === "family"}
            className="min-h-11"
            onClick={() => void navigate({ search: { for: "family" } })}
          >
            Families 家庭
          </Button>
        </div>
        {audience === "family" && (
          <div role="group" aria-label="Language" className="flex gap-1">
            <Button
              variant={lang === "en" ? "secondary" : "ghost"}
              aria-pressed={lang === "en"}
              onClick={() => setLang("en")}
            >
              EN
            </Button>
            <Button
              variant={lang === "zh-CN" ? "secondary" : "ghost"}
              aria-pressed={lang === "zh-CN"}
              onClick={() => setLang("zh-CN")}
            >
              中文
            </Button>
          </div>
        )}
      </div>
      <HelpCentre
        key={audience}
        audience={audience}
        lang={lang}
        mode="public"
        supportEmail={email}
      />
      <p className="text-sm text-[#6B6052]">
        {audience === "family" && lang === "zh-CN" ? "也可以发邮件至 " : "You can also email "}
        <a className="text-[#604A19] underline" href={`mailto:${email}`}>
          {email}
        </a>
        {audience === "family" && lang === "zh-CN"
          ? "。我们绝不会索要您的密码或验证码。"
          : ". We never ask for your password or authenticator codes."}
      </p>
    </PublicPage>
  );
}
