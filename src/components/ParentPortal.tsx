import { Suspense, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Home, MessageCircle, ChartNoAxesColumnIncreasing, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParentLanguageProvider, useParentLanguage } from "@/i18n/parent";
import { ParentHome } from "@/components/ParentHome";
import { ParentChat } from "@/components/ParentChat";
import { ParentProgress } from "@/components/ParentProgress";
import { ParentInvoices } from "@/components/ParentInvoices";
import { parentSessionQuery } from "@/lib/parent-queries";
export function ParentPortal() {
  const { data } = useSuspenseQuery(parentSessionQuery);
  return <ParentLanguageProvider initial={data.guardian.preferredLanguage}><ParentViews /></ParentLanguageProvider>;
}
function ParentViews() {
  const { t, lang, setLang } = useParentLanguage();
  const [view, setView] = useState<"home" | "chat" | "progress" | "invoices">("home");
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const tabs = [{ key: "home", Icon: Home }, { key: "chat", Icon: MessageCircle }, { key: "progress", Icon: ChartNoAxesColumnIncreasing }, { key: "invoices", Icon: Receipt }] as const;
  return <div className="mx-auto max-w-xl pb-24"><div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><span className="font-display text-xl font-semibold">{t("family")}</span><div role="group" aria-label={t("language")} className="flex gap-1"><Button variant={lang === "en" ? "secondary" : "ghost"} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</Button><Button variant={lang === "zh-CN" ? "secondary" : "ghost"} aria-pressed={lang === "zh-CN"} onClick={() => setLang("zh-CN")}>中文</Button></div></div>
    <Suspense fallback={<p className="py-8 text-base">{t("loading")}</p>}>{view === "home" ? <ParentHome openChat={() => setView("chat")} openInvoice={(id) => { setInvoiceId(id); setView("invoices"); }} /> : view === "chat" ? <ParentChat /> : view === "progress" ? <ParentProgress /> : <ParentInvoices selected={invoiceId} select={setInvoiceId} />}</Suspense>
    <nav aria-label={t("family")} className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"><div className="mx-auto grid max-w-xl grid-cols-4">{tabs.map(({ key, Icon }) => <Button key={key} variant="ghost" aria-pressed={view === key} onClick={() => { setView(key); setInvoiceId(null); window.scrollTo({ top: 0 }); }} className={`min-h-20 min-w-0 flex-col gap-1 whitespace-normal rounded-none px-1 text-base ${view === key ? "bg-secondary text-primary" : "text-muted-foreground"}`}><Icon className="size-6" aria-hidden />{t(key)}</Button>)}</div></nav>
  </div>;
}