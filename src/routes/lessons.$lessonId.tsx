import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, Mic, Plus, Send, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProgressRing } from "@/components/ProgressRing";
import { finishLesson, getLiveLesson, saveLessonNotes } from "@/services/lessons";
import { addPractice, setProgress } from "@/services/curriculum";
import { readiness, weekPractice } from "@/lib/lesson-progress";
import { formatShortDate, formatTime } from "@/lib/format";
import type { RequirementCategory, StudentProgress } from "@/mocks/types";

const lessonQuery = (id: string) => queryOptions({ queryKey: ["live-lesson", id], queryFn: () => getLiveLesson(id) });
const CATEGORIES: { id: RequirementCategory; label: string }[] = [
  { id: "scales", label: "Scales" }, { id: "pieces", label: "Pieces" }, { id: "aural", label: "Aural" }, { id: "sight-reading", label: "Sight-reading" },
];
const STATUSES: { id: StudentProgress["status"]; label: string }[] = [
  { id: "not_started", label: "Not started" }, { id: "learning", label: "Learning" }, { id: "passed", label: "Passed" },
];

export const Route = createFileRoute("/lessons/$lessonId")({
  loader: async ({ context, params }) => { if (!await context.queryClient.ensureQueryData(lessonQuery(params.lessonId))) throw notFound(); },
  errorComponent: () => <p role="alert">This lesson could not be opened. Please refresh to try again.</p>,
  notFoundComponent: () => <div><h1 className="text-3xl">Lesson not found</h1><Button asChild className="mt-4"><Link to="/">Back to Today</Link></Button></div>,
  head: () => ({ meta: [
    { title: "Live Lesson — Opus" }, { name: "description", content: "Record piano lesson progress, practice and notes, and send a summary to the family." },
    { property: "og:title", content: "Live Lesson — Opus" }, { property: "og:description", content: "Piano lesson progress, practice and family summaries." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: LiveLesson,
});

function LiveLesson() {
  const { lessonId } = Route.useParams();
  const { data } = useSuspenseQuery(lessonQuery(lessonId));
  if (!data) return null;
  return <LessonSession key={lessonId} data={data} />;
}

function LessonSession({ data }: { data: NonNullable<Awaited<ReturnType<typeof getLiveLesson>>> }) {
  const qc = useQueryClient();
  const { lesson, date } = data;
  const [notes, setNotes] = useState(data.draft.notes);
  const [voiceSeconds, setVoiceSeconds] = useState(data.draft.voiceSeconds);
  const [addingMinutes, setAddingMinutes] = useState(false);
  const [minutes, setMinutes] = useState("15");
  const [sent, setSent] = useState<{ conversationId: string; body: string } | null>(null);
  const finished = Boolean(data.draft.summaryMessageId || sent);
  const percent = readiness(data.requirements, data.progress);
  const practice = weekPractice(data.practice, date);
  const refresh = () => qc.invalidateQueries({ queryKey: ["live-lesson", lesson.id] });
  const progressMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: StudentProgress["status"] }) => setProgress(lesson.studentId, id, status),
    onSuccess: async () => { await refresh(); }, onError: () => toast.error("Progress could not be saved. Please try again."),
  });
  const practiceMutation = useMutation({
    mutationFn: () => addPractice({ studentId: lesson.studentId, date, minutes: Number(minutes), loggedBy: "teacher" }),
    onSuccess: async () => { await refresh(); setAddingMinutes(false); toast.success(`${minutes} practice minutes added`); },
    onError: () => toast.error("Practice could not be saved. Please try again."),
  });
  const finishMutation = useMutation({
    mutationFn: async () => { await saveLessonNotes(lesson.id, { notes, voiceSeconds }); return finishLesson(lesson.id); },
    onSuccess: async (message) => {
      setSent({ conversationId: message.conversationId, body: message.body });
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["conversations"] }), qc.invalidateQueries({ queryKey: ["messages", message.conversationId] })]);
      toast.success(`Summary sent to ${data.family?.displayName ?? "family"}`);
    },
    onError: () => toast.error("Summary was not sent. Please try again."),
  });
  const locked = finished || finishMutation.isPending;
  const saveNotes = () => { void saveLessonNotes(lesson.id, { notes, voiceSeconds }); };
  const conversationId = sent?.conversationId ?? data.draft.conversationId;

  return <div className="mx-auto max-w-5xl">
    <Button variant="ghost" asChild><Link to="/" search={{ date }}><ArrowLeft aria-hidden /> Back to day-book</Link></Button>
    <header className="mt-5 flex flex-wrap items-center justify-between gap-6 border-b border-border pb-6">
      <div><p className="text-base font-semibold text-muted-foreground">Live Lesson · {formatShortDate(date)} · {formatTime(lesson.startsAt)}</p>
        <h1 className="mt-2 text-4xl font-semibold">{lesson.student.firstName} {lesson.student.lastName}</h1>
        <p className="mt-2 text-xl">{lesson.gradeGoal}</p><p className="mt-1 text-base text-muted-foreground">{lesson.lessonType.name}</p>
      </div>
      <ProgressRing percent={percent} />
    </header>

    <section aria-label="Grade requirements" className="py-6">
      <h2 className="text-2xl font-semibold">Grade requirements</h2>
      {CATEGORIES.map((category) => <section key={category.id} aria-label={category.label} className="mt-6">
        <h3 className="border-b border-border pb-2 text-xl font-semibold">{category.label}</h3>
        {data.requirements.filter((requirement) => requirement.category === category.id).map((requirement) => {
          const current = data.progress.find((entry) => entry.requirementId === requirement.id)?.status ?? "not_started";
          return <div key={requirement.id} className="grid items-center gap-3 border-b border-border py-4 xl:grid-cols-[minmax(0,1fr)_auto]">
            <p className="text-lg">{requirement.title}</p>
            <div role="group" aria-label={requirement.title} className="grid grid-cols-3 gap-2">
              {STATUSES.map((status) => <Button key={status.id} variant={current === status.id ? "secondary" : "outline"}
                className={`min-w-0 whitespace-normal px-2 text-base ${current === status.id ? "ring-2 ring-primary" : ""}`}
                aria-pressed={current === status.id} disabled={locked || progressMutation.isPending}
                onClick={() => progressMutation.mutate({ id: requirement.id, status: status.id })}>{status.label}</Button>)}
            </div>
          </div>;
        })}
      </section>)}
    </section>

    <section aria-label="Practice this week" className="border-y border-border py-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-semibold">Practice this week</h2>
        <Button variant="outline" disabled={locked} onClick={() => setAddingMinutes(!addingMinutes)}><Plus aria-hidden /> Add minutes</Button></div>
      <div className="mt-4 flex flex-wrap gap-x-12 gap-y-4"><p><strong className="font-display text-3xl">{practice.student} min</strong><span className="mt-1 block text-base text-muted-foreground">Logged by student</span></p>
        <p><strong className="font-display text-3xl">{practice.teacher} min</strong><span className="mt-1 block text-base text-muted-foreground">Added by teacher</span></p></div>
      {addingMinutes && <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (Number.isInteger(Number(minutes)) && Number(minutes) > 0) practiceMutation.mutate(); }}>
        <label className="block text-base">Minutes<Input className="mt-2 h-12 w-32 md:text-base" type="number" min="1" step="1" required value={minutes} onChange={(event) => setMinutes(event.target.value)} disabled={practiceMutation.isPending} /></label>
        <Button variant="secondary" type="submit" disabled={practiceMutation.isPending}>Save minutes</Button>
        <Button variant="ghost" type="button" onClick={() => setAddingMinutes(false)}>Cancel</Button>
      </form>}
    </section>

    <section className="py-6" aria-label="Lesson notes"><label htmlFor="lesson-notes" className="font-display text-2xl font-semibold">Lesson notes</label>
      <Textarea id="lesson-notes" className="mt-4 min-h-40 bg-card md:text-base" value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={saveNotes} disabled={locked} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!voiceSeconds ? <Button variant="outline" disabled={locked} onClick={() => { setVoiceSeconds(10); void saveLessonNotes(lesson.id, { notes, voiceSeconds: 10 }); }}><Mic aria-hidden /> Record voice note</Button>
          : <><span className="flex min-h-12 items-center gap-2 text-base"><Mic aria-hidden className="size-5 text-primary" /> 0:10 · Simulated voice clip</span>
            <Button variant="ghost" disabled={locked} onClick={() => { setVoiceSeconds(0); void saveLessonNotes(lesson.id, { notes, voiceSeconds: 0 }); }}><Trash2 aria-hidden /> Remove clip</Button></>}
      </div>
    </section>

    <footer className="border-t border-border py-6">
      {finished ? <div role="status"><p className="flex items-center gap-2 text-lg font-semibold text-success"><Check aria-hidden /> Summary sent to {data.family?.displayName ?? "family"}</p>
        {conversationId && <Button className="mt-4" variant="outline" asChild><Link to="/chat/$conversationId" params={{ conversationId }}><MessageCircle aria-hidden /> View family summary</Link></Button>}
      </div> : <Button className="w-full whitespace-normal" size="lg" disabled={finishMutation.isPending || progressMutation.isPending || practiceMutation.isPending} onClick={() => finishMutation.mutate()}><Send aria-hidden />{finishMutation.isPending ? "Sending summary…" : "Finish and send summary to family"}</Button>}
    </footer>
  </div>;
}