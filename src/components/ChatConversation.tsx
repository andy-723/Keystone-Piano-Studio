import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMedia } from "@/components/ChatMedia";
import { ChatComposer } from "@/components/ChatComposer";
import { chatThreadQuery, messageDay } from "@/lib/chat-queries";
import { formatShortDate, formatTime } from "@/lib/format";
import { markThreadRead } from "@/services/chat";
import { MessageTranslation } from "@/components/MessageTranslation";

export function ChatConversation({ id, initialText = "", draftKey = "", onSent }: { id: string; initialText?: string; draftKey?: string; onSent?: () => void }) {
  const { data } = useSuspenseQuery(chatThreadQuery(id));
  const client = useQueryClient();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { void markThreadRead(id).then(() => client.invalidateQueries({ queryKey: ["chat-threads"] })); }, [id, client]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [id, data?.messages.length]);
  if (!data) return <p className="p-6">Family conversation not found.</p>;
  return <section className="chat-conversation flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Family conversation">
    <header className="shrink-0 border-b border-border px-4 py-4 md:px-6">
      <Button asChild variant="ghost" className="mb-2 md:hidden"><Link to="/chat"><ArrowLeft aria-hidden /> All families</Link></Button>
      <h2 className="text-2xl font-semibold">{data.family?.displayName ?? "Family conversation"}</h2>
      <p className="mt-1 text-base text-muted-foreground">{data.family?.guardians.map((guardian) => guardian.name).join(" · ")}</p>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6" aria-label="Messages">
      {data.messages.length === 0 && <p className="py-8 text-muted-foreground">No messages yet.</p>}
      {data.messages.map((message, index) => {
        const day = messageDay(message.sentAt);
        const previous = data.messages[index - 1];
        const teacher = message.authorRole === "teacher";
        const summary = message.lessonSummary;
        return <div key={message.id}>
          {(!previous || messageDay(previous.sentAt) !== day) && <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-border" /><h3 className="font-sans text-base font-normal text-muted-foreground">{formatShortDate(day)}</h3><div className="h-px flex-1 bg-border" /></div>}
          <article className={`mb-5 max-w-xl ${teacher ? "ml-auto" : "mr-auto"}`} aria-label={`${message.authorName} message`}>
            <p className="mb-1 break-words text-base font-semibold">{message.authorName} <span className="font-normal text-muted-foreground">· {teacher ? "Teacher" : message.authorRole === "guardian" ? "Parent" : "Student"}</span></p>
            <div className={`rounded-md px-4 py-3 ${summary ? "border-l-4 border-success bg-success-soft" : teacher ? "bg-secondary" : "bg-muted"}`}>
              {message.intakeRecordId && <Button asChild variant="link"><Link to="/intake/$recordId" params={{recordId:message.intakeRecordId}}>Open intake form</Link></Button>}{message.assignmentCard && <h3 className="mb-3 text-xl font-semibold">{message.assignmentCard.label}</h3>}{message.welcomeSummary && <h3 className="mb-3 text-xl font-semibold">Welcome summary · {message.welcomeSummary.studentName}</h3>}{summary && <div className="mb-3 border-b border-border pb-3"><p className="flex items-center gap-2 font-semibold text-success"><BookOpen aria-hidden className="size-5" /> Lesson summary</p><h3 className="mt-2 text-xl font-semibold">{summary.studentName}</h3><p className="text-base">{summary.gradeGoal} · {summary.readiness}% ready</p></div>}
              {message.body && <p className="whitespace-pre-wrap break-words text-lg">{summary ? message.body.split("\n\n").slice(2).join("\n\n") : message.body}</p>}
              {message.kind !== "text" && <div className="mt-2"><ChatMedia message={message} /></div>}
              <MessageTranslation messageId={message.id} body={message.body} />
            </div>
            <p className="mt-1 flex items-center justify-end gap-2 text-base text-muted-foreground"><time dateTime={message.sentAt}>{formatTime(message.sentAt)}</time>{teacher && <span className="inline-flex items-center gap-1" title={message.readAt ? "Read by family" : "Sent"}>{message.readAt ? <CheckCheck className="size-5 text-success" aria-hidden /> : <Check className="size-5" aria-hidden />}{message.readAt ? "Read" : "Sent"}</span>}</p>
          </article>
        </div>;
      })}
      <div ref={bottom} />
    </div>
    <ChatComposer key={`${id}-${draftKey}`} conversationId={id} initialText={initialText} {...(onSent ? { onSent } : {})} />
  </section>;
}