import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, Check, CheckCheck } from "lucide-react";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatMedia } from "@/components/ChatMedia";
import { parentChatQuery } from "@/lib/parent-queries";
import { readParentChat } from "@/services/parent";
import { useParentLanguage, parentDate, parentGrade } from "@/i18n/parent";
import { messageDay } from "@/lib/chat-queries";
import { formatTime } from "@/lib/format";

export function ParentChat({initialText=''}:{initialText?:string}) {
  const { data } = useSuspenseQuery(parentChatQuery);
  const { t, lang } = useParentLanguage();
  const client = useQueryClient();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { void readParentChat().then(() => { void client.invalidateQueries({ queryKey: ["parent", "chat"] }); void client.invalidateQueries({ queryKey: ["messages"] }); }); }, [client]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [data?.messages.length]);
  return <div><h1 className="mb-5 text-3xl font-semibold">{t("chat")}</h1><section className="flex min-h-0 flex-col border-y border-border bg-card"><div className="max-h-[60dvh] overflow-y-auto p-3"><p className="mb-4 text-base text-muted-foreground">{t("family")} · Ms Clarke</p>{data?.messages.map((message, index) => {
    const own = message.authorRole !== "teacher";
    const previous = data.messages[index - 1];
    return <article key={message.id} className="mb-5">{(!previous || messageDay(previous.sentAt) !== messageDay(message.sentAt)) && <p className="my-5 text-center text-base text-muted-foreground">{parentDate(message.sentAt, lang)}</p>}<p className="mb-2 text-base font-semibold">{message.authorName} <span className="font-normal text-muted-foreground">· {t(message.authorRole === "guardian" ? "parent" : message.authorRole)}</span></p>
      <div className={`rounded-md p-4 ${message.lessonSummary ? "border-l-4 border-success bg-success-soft" : own ? "bg-secondary" : "bg-muted"}`}>{message.intakeRecordId && <Button asChild variant="link"><Link to="/intake/$recordId" params={{recordId:message.intakeRecordId}}>{lang === "en" ? "Open intake form" : "打开入学表"}</Link></Button>}{message.assignmentCard && <h3 className="mb-3 text-xl font-semibold">{message.assignmentCard.label}</h3>}{message.welcomeSummary && <h3 className="mb-3 text-xl font-semibold">{lang === "en" ? "Welcome summary" : "欢迎总结"} · {message.welcomeSummary.studentName}</h3>}{message.lessonSummary && <div className="mb-3 border-b border-border pb-3"><p className="flex items-center gap-2 font-semibold text-success"><BookOpen className="size-5" aria-hidden />{t("lessonSummary")}</p><p className="mt-2 text-lg font-semibold">{message.lessonSummary.studentName}</p><p className="mt-1 text-base">{parentGrade(message.lessonSummary.gradeGoal, lang)} · {message.lessonSummary.readiness}% {t("ready")}</p></div>}{message.lessonSummary ? <div className="space-y-3 text-lg"><p>{t("passedSummary", { passed: message.lessonSummary.passedCount ?? 0, total: message.lessonSummary.requirementCount ?? 0 })}</p><p>{t("practiceSummary", { student: message.lessonSummary.studentMinutes ?? 0, teacher: message.lessonSummary.teacherMinutes ?? 0 })}</p>{message.lessonSummary.notes && <p className="whitespace-pre-wrap break-words">{t("notes")}: {message.lessonSummary.notes}</p>}{Boolean(message.lessonSummary.voiceSeconds) && <p>{t("summaryVoice", { seconds: message.lessonSummary.voiceSeconds ?? 0 })}</p>}</div> : <p className="whitespace-pre-wrap break-words text-lg">{message.body}</p>}{message.kind !== "text" && <ChatMedia message={message} lang={lang} />}</div><p className="mt-1 flex justify-end gap-2 text-base text-muted-foreground">{formatTime(message.sentAt)} {own && <span className="inline-flex items-center gap-1">{message.readAt ? <CheckCheck aria-hidden className="size-5 text-success" /> : <Check aria-hidden className="size-5" />}{message.readAt ? t("read") : t("sent")}</span>}</p></article>;
  })}<div ref={bottom} /></div>{data && <ChatComposer key={initialText} initialText={initialText} conversationId={data.conversation.id} parentLang={lang} />}</section></div>;
}