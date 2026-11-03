import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, MessageCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParentPayment } from "@/components/ParentPayment";
import { parentHomeQuery } from "@/lib/parent-queries";
import { useParentLanguage, parentDate } from "@/i18n/parent";
import { formatAUD, formatTime } from "@/lib/format";
import { ParentMakeUps } from "@/components/ParentMakeUps";
import { ParentRenewal } from "@/components/ParentRenewal";
import { ParentAssignments } from "@/components/Assignments";
import { ParentIntakes } from "@/components/StudentIntake";
import { FamilyNews } from "./StudioNews";
import { ProfilePicture } from "./ProfilePicture";
export function ParentHome({ openChat, openInvoice }: { openChat: () => void; openInvoice: (id: string) => void }) {
  const { data } = useSuspenseQuery(parentHomeQuery);
  const { t, lang } = useParentLanguage();
  return <div><h1 className="text-3xl font-semibold">{t("greeting")}</h1><p className="mt-2 text-base text-muted-foreground">{data.children.map((child) => child.firstName).join(" & ")}</p>
    <div className="mt-4 flex flex-wrap gap-4">{data.children.map(child => <ProfilePicture key={child.id} id={child.id} name={`${child.firstName} ${child.lastName}`}/>)}</div>
    <FamilyNews/>
    <ParentIntakes />
    <ParentAssignments />
    <ParentRenewal />
    <ParentMakeUps />
    <section className="mt-6 border-y border-border py-6"><h2 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays aria-hidden className="size-6 text-primary" />{t("nextLesson")}</h2>{data.nextLesson ? <><p className="mt-4 text-2xl font-semibold">{data.nextLesson.student.firstName} {data.nextLesson.student.lastName}</p><p className="mt-2 text-xl">{parentDate(data.nextLesson.startsAt, lang)} · {formatTime(data.nextLesson.startsAt)}</p><p className="mt-2 text-base text-muted-foreground">{t("duration", { minutes: data.nextLesson.lessonType.durationMin })}</p></> : <p className="mt-3">{t("noLesson")}</p>}</section>
    <section className="py-6"><h2 className="text-xl font-semibold">{t("unpaid")}</h2>{data.unpaid.length === 0 && <p className="mt-3 text-success">{t("noUnpaid")}</p>}{data.unpaid.map((invoice) => <div key={invoice.id} className="mt-4 border-b border-border pb-5"><Button variant="ghost" onClick={() => openInvoice(invoice.id)} className="mb-3 h-auto w-full justify-between whitespace-normal px-0 text-left"><span>{invoice.number}<span className="mt-1 block text-base font-normal text-muted-foreground">{t("due")} {parentDate(invoice.dueDate, lang)}</span></span><span className="text-xl">{formatAUD(invoice.balanceCents ?? invoice.totalCents)}</span></Button><ParentPayment invoice={invoice} /></div>)}</section>
    <section className="border-t border-border py-6"><h2 className="flex items-center gap-2 text-xl font-semibold"><MessageCircle aria-hidden className="size-6 text-primary" />{t("latestTeacher")}</h2><p className="mt-4 whitespace-pre-wrap break-words text-lg">{data.latestTeacher?.lessonSummary ? t("lessonSummary") : data.latestTeacher?.body ?? t("noMessage")}</p><Button variant="outline" className="mt-5 w-full" onClick={openChat}>{t("openChat")}<ArrowRight aria-hidden /></Button></section>
    {data.sharedNotes.length > 0 && <section className="border-t border-border py-6"><h2 className="text-2xl font-semibold">{t("sharedNotes")}</h2><div className="mt-4 space-y-5">{data.sharedNotes.map((note) => <div key={note.id}><p className="whitespace-pre-wrap text-base italic">{note.body}</p><p className="mt-2 flex flex-wrap items-center gap-2 text-base text-muted-foreground">{note.authorName} · {parentDate(note.createdAt, lang)} <Users aria-hidden className="size-4" />{t("shared")}</p></div>)}</div></section>}
  </div>;
}