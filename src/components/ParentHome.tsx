import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParentPayment } from "@/components/ParentPayment";
import { parentHomeQuery } from "@/lib/parent-queries";
import { useParentLanguage, parentDate } from "@/i18n/parent";
import { formatAUD, formatTime } from "@/lib/format";
export function ParentHome({ openChat, openInvoice }: { openChat: () => void; openInvoice: (id: string) => void }) {
  const { data } = useSuspenseQuery(parentHomeQuery);
  const { t, lang } = useParentLanguage();
  return <div><h1 className="text-3xl font-semibold">{t("greeting")}</h1><p className="mt-2 text-base text-muted-foreground">{data.children.map((child) => child.firstName).join(" & ")}</p>
    <section className="mt-6 border-y border-border py-6"><h2 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays aria-hidden className="size-6 text-primary" />{t("nextLesson")}</h2>{data.nextLesson ? <><p className="mt-4 text-2xl font-semibold">{data.nextLesson.student.firstName} {data.nextLesson.student.lastName}</p><p className="mt-2 text-xl">{parentDate(data.nextLesson.startsAt, lang)} · {formatTime(data.nextLesson.startsAt)}</p><p className="mt-2 text-base text-muted-foreground">{t("duration", { minutes: data.nextLesson.lessonType.durationMin })}</p></> : <p className="mt-3">{t("noLesson")}</p>}</section>
    <section className="py-6"><h2 className="text-xl font-semibold">{t("unpaid")}</h2>{data.unpaid.length === 0 && <p className="mt-3 text-success">{t("noUnpaid")}</p>}{data.unpaid.map((invoice) => <div key={invoice.id} className="mt-4 border-b border-border pb-5"><Button variant="ghost" onClick={() => openInvoice(invoice.id)} className="mb-3 h-auto w-full justify-between whitespace-normal px-0 text-left"><span>{invoice.number}<span className="mt-1 block text-base font-normal text-muted-foreground">{t("due")} {parentDate(invoice.dueDate, lang)}</span></span><span className="text-xl">{formatAUD(invoice.balanceCents ?? invoice.totalCents)}</span></Button><ParentPayment invoice={invoice} /></div>)}</section>
    <section className="border-t border-border py-6"><h2 className="flex items-center gap-2 text-xl font-semibold"><MessageCircle aria-hidden className="size-6 text-primary" />{t("latestTeacher")}</h2><p className="mt-4 whitespace-pre-wrap break-words text-lg">{data.latestTeacher?.lessonSummary ? t("lessonSummary") : data.latestTeacher?.body ?? t("noMessage")}</p><Button variant="outline" className="mt-5 w-full" onClick={openChat}>{t("openChat")}<ArrowRight aria-hidden /></Button></section>
  </div>;
}