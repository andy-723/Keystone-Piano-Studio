import { Suspense, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Home, MessageCircle, ChartNoAxesColumnIncreasing, Receipt, Megaphone } from "lucide-react";
import { FamilyNews } from "./StudioNews";
import { newsText } from "@/i18n/news";
import { Button } from "@/components/ui/button";
import { ParentLanguageProvider, useParentLanguage } from "@/i18n/parent";
import { ParentHome } from "@/components/ParentHome";
import { ParentChat } from "@/components/ParentChat";
import { ParentProgress } from "@/components/ParentProgress";
import { ParentInvoices } from "@/components/ParentInvoices";
import { parentSessionQuery } from "@/lib/parent-queries";
import { BrandLockup } from "@/components/BrandLogo";

export function ParentPortal() {
  const { data } = useSuspenseQuery(parentSessionQuery);
  return (
    <ParentLanguageProvider initial={data.guardian.preferredLanguage}>
      <ParentViews />
    </ParentLanguageProvider>
  );
}

function ParentViews() {
  const { t, lang, setLang } = useParentLanguage();
  const [view, setView] = useState<"news" | "home" | "chat" | "progress" | "invoices">("news");
  const [quote, setQuote] = useState("");
  const openNewsChat = (title: string) => {
    setQuote(`“${title}”\n`);
    setView("chat");
  };
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const tabs = [
    { key: "news", Icon: Megaphone },
    { key: "home", Icon: Home },
    { key: "chat", Icon: MessageCircle },
    { key: "progress", Icon: ChartNoAxesColumnIncreasing },
    { key: "invoices", Icon: Receipt },
  ] as const;

  return (
    <div className="mx-auto max-w-xl px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-4">
      <header className="mb-6 flex min-w-0 items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0 flex-1">
          <BrandLockup priority />
          <p className="mt-2 font-display text-lg font-semibold">{t("family")}</p>
        </div>
        <div role="group" aria-label={t("language")} className="flex shrink-0 gap-1">
          <Button
            variant={lang === "en" ? "secondary" : "ghost"}
            aria-pressed={lang === "en"}
            className="min-h-12 min-w-12 px-3"
            onClick={() => setLang("en")}
          >
            EN
          </Button>
          <Button
            variant={lang === "zh-CN" ? "secondary" : "ghost"}
            aria-pressed={lang === "zh-CN"}
            className="min-h-12 min-w-12 px-3"
            onClick={() => setLang("zh-CN")}
          >
            中文
          </Button>
        </div>
      </header>

      <Suspense fallback={<p className="py-8 text-base">{t("loading")}</p>}>
        {view === "news" ? (
          <FamilyNews onMessage={openNewsChat} />
        ) : view === "home" ? (
          <ParentHome
            openNewsChat={openNewsChat}
            openChat={() => {
              setQuote("");
              setView("chat");
            }}
            openInvoice={(id) => {
              setInvoiceId(id);
              setView("invoices");
            }}
          />
        ) : view === "chat" ? (
          <ParentChat initialText={quote} />
        ) : view === "progress" ? (
          <ParentProgress />
        ) : (
          <ParentInvoices selected={invoiceId} select={setInvoiceId} />
        )}
      </Suspense>

      <nav
        aria-label={t("family")}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {tabs.map(({ key, Icon }) => (
            <Button
              key={key}
              variant="ghost"
              aria-pressed={view === key}
              onClick={() => {
                setView(key);
                setQuote("");
                setInvoiceId(null);
                window.scrollTo({ top: 0 });
              }}
              className={`min-h-20 min-w-0 flex-col gap-1 whitespace-normal rounded-none px-1 text-base ${
                view === key ? "bg-secondary text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-6" aria-hidden />
              {key === "news" ? newsText(lang, "news") : t(key)}
            </Button>
          ))}
        </div>
      </nav>
    </div>
  );
}
