import { Suspense, useEffect, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { getReacceptanceStatus } from "@/services/terms";
import { Home, MessageCircle, ChartNoAxesColumnIncreasing, Receipt, Megaphone, LifeBuoy } from "lucide-react";
import { FamilyNews } from './StudioNews';
import { newsText } from '@/i18n/news';
import { Button } from "@/components/ui/button";
import { ParentLanguageProvider, useParentLanguage } from "@/i18n/parent";
import { ParentHome } from "@/components/ParentHome";
import { ParentChat } from "@/components/ParentChat";
import { ParentProgress } from "@/components/ParentProgress";
import { ParentInvoices } from "@/components/ParentInvoices";
import { parentSessionQuery } from "@/lib/parent-queries";
import { ReacceptanceCard } from "@/components/terms/ReacceptanceCard";
import { BrandLogo } from "@/components/BrandLogo";
import { teacherProfileQuery } from "@/lib/community-queries";
import { isLiveAuthConfigured } from "@/lib/auth-client";
import { HelpCentre } from "@/components/help/HelpCentre";
import { helpText } from "@/lib/help/ui-text";
import { EmailNotificationSettings } from "@/components/EmailNotificationSettings";
import { publicSupportEmail } from "@/components/public/PublicPage";
import { TourHelpButton, TourProvider } from "@/components/tour/Tour";
import { FAMILY_TOUR } from "@/lib/tour-steps";

function invoiceDeepLink(): { view: "invoices"; invoiceId: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") !== "invoices") return null;
  const invoiceId = params.get("invoice")?.trim();
  if (!invoiceId) return null;
  return { view: "invoices", invoiceId };
}

export function ParentPortal() {
  const { data } = useSuspenseQuery(parentSessionQuery);
  return <ParentLanguageProvider initial={data.guardian.preferredLanguage}><ParentViews /></ParentLanguageProvider>;
}

function ParentViews() {
  const { t, lang, setLang } = useParentLanguage();
  const { data: profile } = useSuspenseQuery(teacherProfileQuery());
  const deepLink = invoiceDeepLink();
  const [view, setView] = useState<"news" | "home" | "chat" | "progress" | "invoices" | "help">(
    deepLink?.view ?? "news",
  );
  const [quote, setQuote] = useState('');
  const [deferReaccept, setDeferReaccept] = useState(false);
  // Same query as ReacceptanceCard: a terms update comes before the tour.
  const reaccept = useQuery({
    queryKey: ["terms-reaccept"],
    queryFn: () => getReacceptanceStatus("demo"),
  });
  const termsFirst = !deferReaccept && (reaccept.isPending || Boolean(reaccept.data?.needed));
  const openNewsChat = (title: string) => { setQuote(`“${title}”\n`); setView('chat'); };
  const [invoiceId, setInvoiceId] = useState<string | null>(deepLink?.invoiceId ?? null);

  useEffect(() => {
    const link = invoiceDeepLink();
    if (!link) return;
    setView("invoices");
    setInvoiceId(link.invoiceId);
  }, []);
  const tabs = [{ key: "news", Icon: Megaphone }, { key: "home", Icon: Home }, { key: "chat", Icon: MessageCircle }, { key: "progress", Icon: ChartNoAxesColumnIncreasing }, { key: "invoices", Icon: Receipt }] as const;
  return (
    <TourProvider
      tourId="family"
      steps={FAMILY_TOUR}
      lang={lang}
      cardBottomClass="bottom-[calc(6rem+env(safe-area-inset-bottom))]"
      paused={termsFirst}
      onStep={(step) => {
        if (step.view) {
          setView(step.view);
          setQuote("");
          setInvoiceId(null);
        }
      }}
    >
      <div className="mx-auto max-w-xl pb-24">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="min-w-0">
            <BrandLogo variant="horizontal" alt="Keystone Music HQ" />
            <h1 className="mt-3 font-display text-2xl font-semibold">{profile.studioName}</h1>
            <p className="mt-1 text-base text-muted-foreground">{t("family")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={view === "help" ? "secondary" : "outline"} aria-pressed={view === "help"} className="min-h-11" onClick={() => { setView("help"); setQuote(''); window.scrollTo({ top: 0 }); }}>
              <LifeBuoy aria-hidden />{helpText(lang, "help")}
            </Button>
            <TourHelpButton />
            <div
              role="group"
              aria-label={t("language")}
              className="flex gap-1"
              data-tour="family-language"
            >
              <Button variant={lang === "en" ? "secondary" : "ghost"} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</Button>
              <Button variant={lang === "zh-CN" ? "secondary" : "ghost"} aria-pressed={lang === "zh-CN"} onClick={() => setLang("zh-CN")} className="whitespace-nowrap">中文</Button>
              <Button variant={lang === "vi" ? "secondary" : "ghost"} aria-pressed={lang === "vi"} onClick={() => setLang("vi")} lang="vi" aria-label="Tiếng Việt">VI</Button>
            </div>
          </div>
        </div>
        {isLiveAuthConfigured() && (
          <div className="mb-4 rounded-xl border border-border bg-card p-4" data-testid="guardian-mfa-card">
            <h2 className="text-lg font-semibold">Turn on two-step sign-in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional for families. An authenticator app adds a 6-digit code after email or Google sign-in.
            </p>
            <Button className="mt-3 min-h-11" asChild>
              <a href="/auth/mfa-setup">Set up authenticator</a>
            </Button>
          </div>
        )}
        {!deferReaccept && (
          <Suspense fallback={null}>
            <ReacceptanceCard
              onLater={() => setDeferReaccept(true)}
              onMessageTeacher={(prefill) => { setQuote(prefill); setView("chat"); setDeferReaccept(true); }}
            />
          </Suspense>
        )}
        <Suspense fallback={<p className="py-8 text-base">{t("loading")}</p>}>
          {view === "help" ? (
            <div>
              <h2 className="mb-4 font-display text-2xl font-semibold">{helpText(lang, "helpCentre")}</h2>
              <HelpCentre audience="family" lang={lang} mode={isLiveAuthConfigured() ? "live" : "demo"} supportEmail={publicSupportEmail()} onMessageTeacher={(prefill) => { setQuote(prefill); setView("chat"); window.scrollTo({ top: 0 }); }} />
              <EmailNotificationSettings audience="family" lang={lang} />
            </div>
          ) : view === 'news' ? <FamilyNews onMessage={openNewsChat} /> : view === "home" ? (
            <ParentHome openNewsChat={openNewsChat} openChat={() => { setQuote(''); setView("chat"); }} openInvoice={(id) => { setInvoiceId(id); setView("invoices"); }} />
          ) : view === "chat" ? (
            <ParentChat initialText={quote} />
          ) : view === "progress" ? (
            <ParentProgress />
          ) : (
            <ParentInvoices selected={invoiceId} select={setInvoiceId} />
          )}
        </Suspense>
        <nav aria-label={t("family")} className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto grid max-w-xl grid-cols-5">
            {tabs.map(({ key, Icon }) => (
              <Button
                key={key}
                data-tour={`family-tab-${key}`}
                variant="ghost"
                aria-pressed={view === key}
                onClick={() => { setView(key); setQuote(''); setInvoiceId(null); window.scrollTo({ top: 0 }); }}
                className={`min-h-20 min-w-0 flex-col gap-1 whitespace-normal rounded-none px-1 text-base transition-[background-color,color] duration-150 focus-visible:ring-inset ${view === key ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-accent-hover hover:text-accent-foreground"}`}
              >
                <Icon className="size-6" aria-hidden />
                {key === 'news' ? newsText(lang, 'news') : t(key)}
              </Button>
            ))}
          </div>
        </nav>
      </div>
    </TourProvider>
  );
}
