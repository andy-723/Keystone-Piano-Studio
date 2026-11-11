import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSiteLang } from "@/i18n/marketing/site-lang";
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
  const siteLang = useSiteLang();
  const lang: HelpLang = siteLang === "zh-CN" ? "zh-CN" : "en";
  const email = publicSupportEmail();

  return (
    <PublicPage eyebrow="SUPPORT" title="Help centre">
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
            Families
          </Button>
        </div>
      </div>
      <div data-no-translate={audience === "family" ? "" : undefined}>
      <HelpCentre
        key={audience}
        audience={audience}
        lang={lang}
        mode="public"
        supportEmail={email}
      />
      </div>
      <p className="text-base text-mk-ink/70">
        {"You can also email "}
        <a className="text-mk-bronze underline" href={`mailto:${email}`}>
          {email}
        </a>
        {". We never ask for your password or authenticator codes."}
      </p>
    </PublicPage>
  );
}
