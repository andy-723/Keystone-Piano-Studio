import { ReviewQueue, VideoLessonButton } from "@/components/Assignments";
import { LatestNews } from '@/components/StudioNews';
import { Suspense, useState } from "react";
import { WeekTimetable } from "@/components/WeekTimetable";
import { BookingForm, LessonScheduling } from "@/components/LessonScheduling";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { refreshSchedule } from "@/lib/schedule-queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, X, BookOpenText, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PROTOTYPE_TODAY, addDays } from "@/lib/calendar";
import { formatLongDate, formatTime } from "@/lib/format";
import { getDayLessons, markAttendance, type DayPlan, type LessonWithDetails } from "@/services/schedule";
import type { LessonStatus } from "@/mocks/types";
import { LessonClientNotes, studentNotesQuery } from "@/components/LessonClientNotes";

const dayQuery = (date: string) => queryOptions({ queryKey: ["day", date], queryFn: () => getDayLessons(date) });

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { date?: string } =>
    typeof s["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["date"]) ? { date: s["date"] } : {},
  loaderDeps: ({ search }) => ({ date: search.date ?? PROTOTYPE_TODAY }),
  loader: async ({ context, deps }) => {
    const plan = await context.queryClient.ensureQueryData(dayQuery(deps.date));
    await Promise.all(plan.lessons.map((lesson) => context.queryClient.ensureQueryData(studentNotesQuery(lesson.studentId))));
  },
  errorComponent: () => <p role="alert">The day-book could not be opened. Please refresh to try again.</p>,
  notFoundComponent: () => <p>No day-book page found.</p>,
  head: () => ({
    meta: [
      { title: "Today — Keystone Music HQ day-book" },
      { name: "description", content: "Today's piano lessons, listed by time like a paper day-book." },
      { property: "og:title", content: "Today — Keystone Music HQ day-book" },
      { property: "og:description", content: "Today's piano lessons, listed by time like a paper day-book." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Today,
});

function Today() {
  const { date = PROTOTYPE_TODAY } = Route.useSearch();
  const { data } = useSuspenseQuery(dayQuery(date));
  const [view, setView] = useState<"day" | "week">("day");
  const [selected, setSelected] = useState<LessonWithDetails | null>(null);
  const done = data?.lessons.filter((l) => l.status !== "scheduled").length ?? 0;

  return (
    <div className={`mx-auto ${view === "week" ? "max-w-7xl" : "max-w-4xl"}`}>
      <Suspense fallback={null}><LatestNews/></Suspense>
      <Suspense fallback={<p>Opening reviews…</p>}><ReviewQueue/></Suspense><div className="mb-5 flex gap-2" role="group" aria-label="Timetable view"><Button variant={view === "day" ? "secondary" : "ghost"} aria-pressed={view === "day"} onClick={() => setView("day")}>Day-book</Button><Button variant={view === "week" ? "secondary" : "ghost"} aria-pressed={view === "week"} onClick={() => setView("week")}>Week</Button></div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-wrap sm:justify-between sm:gap-3">
        <Button variant="outline" className="px-2 sm:px-3 md:px-5" asChild>
          <Link to="/" search={{ date: addDays(date, view === "week" ? -7 : -1) }}><ChevronLeft aria-hidden /> Previous {view === "week" ? "week" : "day"}</Link>
        </Button>
        {date !== PROTOTYPE_TODAY && (
          <Button variant="ghost" className="col-span-2 row-start-2 sm:order-none" asChild><Link to="/" search={{}}>Back to today</Link></Button>
        )}
        <Button variant="outline" className="col-start-2 row-start-1 px-2 sm:px-3 md:px-5" asChild>
          <Link to="/" search={{ date: addDays(date, view === "week" ? 7 : 1) }}>Next {view === "week" ? "week" : "day"} <ChevronRight aria-hidden /></Link>
        </Button>
      </div>

      {view === "week" ? <Suspense fallback={<p className="mt-6">Opening the week…</p>}><WeekTimetable date={date} onLesson={setSelected} /></Suspense> : <article className="mt-6 daybook-page px-4 py-6 pl-8 md:px-10 md:py-8 md:pl-24">
        <p className="text-base font-semibold uppercase text-muted-foreground">
          {date === PROTOTYPE_TODAY ? "Today" : "Day-book"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold md:text-5xl">{formatLongDate(date)}</h1>
        {data?.day.kind === "teaching" && (
          <p className="mt-2 text-lg text-muted-foreground">
            {data.day.term} · {data.lessons.length} lessons · {done} marked
          </p>
        )}

        <div className="mt-8 space-y-5">
          {!data && <p className="text-lg text-muted-foreground">Opening the page…</p>}
          {data?.day.kind === "holiday" && <QuietNote>Public holiday — {data.day.name}. No lessons today.</QuietNote>}
          {data?.day.kind === "break" && <QuietNote>School holidays — between terms. No lessons scheduled.</QuietNote>}
          {data?.day.kind === "teaching" && data.lessons.length === 0 && <QuietNote>No lessons scheduled today.</QuietNote>}
          {data?.lessons.map((l) => <LessonCard key={l.id} lesson={l} date={date} />)}
        </div>
      </article>}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogTitle className="pr-8 text-2xl">{selected?.student.firstName} {selected?.student.lastName}</DialogTitle><DialogDescription className="text-base">{selected ? `${formatLongDate(selected.startsAt.slice(0, 10))} · ${formatTime(selected.startsAt)} · ${selected.lessonType.durationMin} minutes` : ""}</DialogDescription>{selected && <>{selected.status === "scheduled" ? <BookingForm mode="move" student={{ id: selected.studentId, name: `${selected.student.firstName} ${selected.student.lastName}`, durationMin: selected.lessonType.durationMin }} occurrenceId={selected.id} originalDate={selected.startsAt.slice(0, 10)} onDone={() => setSelected(null)} /> : <LessonScheduling student={{ id: selected.studentId, name: `${selected.student.firstName} ${selected.student.lastName}`, durationMin: selected.lessonType.durationMin }} movable={false} balance={selected.credits} history />}<Button variant="outline" asChild><Link to="/lessons/$lessonId" params={{ lessonId: selected.id }}>Open lesson</Link></Button></>}</DialogContent></Dialog>
    </div>
  );
}

function QuietNote({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-lg italic text-muted-foreground">{children}</p>;
}

const STATUS_LABEL: Partial<Record<LessonStatus, string>> = {
  attended: "Attended",
  absent: "Absent",
  cancelled_by_studio: "Cancelled by studio",
  cancelled_late: "Late cancel",
};

function LessonCard({ lesson, date }: { lesson: LessonWithDetails; date: string }) {
  const qc = useQueryClient();
  const name = `${lesson.student.firstName} ${lesson.student.lastName}`;
  const mutation = useMutation({
    mutationFn: (status: LessonStatus) => markAttendance(lesson.id, status),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: ["day", date] });
      const previous = qc.getQueryData<DayPlan>(["day", date]);
      qc.setQueryData<DayPlan>(["day", date], (plan) => plan ? {
        ...plan, lessons: plan.lessons.map((entry) => entry.id === lesson.id ? { ...entry, status } : entry),
      } : plan);
      return { previous };
    },
    onError: (_error, _status, context) => {
      if (context?.previous) qc.setQueryData(["day", date], context.previous);
      toast.error("Attendance could not be saved. Please try again.");
    },
    onSuccess: (status) => {
      refreshSchedule(qc);
      toast.success(status === "scheduled" ? `${name}: mark cleared` : `${name} marked: ${STATUS_LABEL[status]}`);
    },
  });
  const marked = lesson.status !== "scheduled";

  return (
    <section
      aria-label={`${formatTime(lesson.startsAt)}, ${name}`}
      className={`rounded-lg border-2 bg-card p-4 md:p-6 ${marked ? "border-border" : "border-input"}`}
    >
      <div className="grid min-w-0 gap-1 sm:flex sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-6">
        <div className="grid min-w-0 gap-1 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-5">
          <span className="shrink-0 whitespace-nowrap font-display text-2xl font-semibold text-primary md:text-3xl">{formatTime(lesson.startsAt)}</span>
          <h2 className="min-w-0 break-words font-sans text-2xl font-bold">{name}</h2>
        </div>
        <span className="text-lg text-muted-foreground">{lesson.lessonType.name} · {lesson.gradeGoal}</span>
      </div>

      {marked ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`inline-flex min-h-12 max-w-full items-center gap-2 rounded-lg px-4 text-lg font-bold ${lesson.status === "attended" ? "bg-success-soft text-success" : lesson.status === "absent" ? "bg-warning-soft text-foreground" : "bg-muted text-muted-foreground"}`}>
            {lesson.status === "attended" ? <Check aria-hidden /> : <X aria-hidden />}
            {STATUS_LABEL[lesson.status]}
          </span>
          <Button variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate("scheduled")}><Undo2 aria-hidden /> Undo</Button>
          <Button variant="outline" className="ml-auto" asChild>
            <Link to="/lessons/$lessonId" params={{ lessonId: lesson.id }}><BookOpenText aria-hidden /> Open lesson</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Button variant="attended" size="lg" disabled={mutation.isPending} onClick={() => mutation.mutate("attended")}>
            <Check aria-hidden /> Attended
          </Button>
          <Button variant="absent" size="lg" disabled={mutation.isPending} onClick={() => mutation.mutate("absent")}>
            <X aria-hidden /> Absent
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link to="/lessons/$lessonId" params={{ lessonId: lesson.id }}><BookOpenText aria-hidden /> Open lesson</Link>
          </Button>
          <div className="flex flex-wrap gap-3 sm:col-span-3">
            <Button variant="secondary" className="max-w-full whitespace-normal" disabled={mutation.isPending} onClick={() => mutation.mutate("cancelled_by_studio")}>
              Cancelled by studio
            </Button>
            <Button variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate("cancelled_late")}>
              Late cancel
            </Button>
          </div>
        </div>
      )}
      <LessonScheduling student={{ id: lesson.studentId, name, durationMin: lesson.lessonType.durationMin }} occurrenceId={lesson.id} date={date} movable={lesson.status === "scheduled" && date >= PROTOTYPE_TODAY} balance={lesson.credits} />
      {lesson.status === "scheduled" && <Suspense fallback={<p>Opening video options…</p>}><VideoLessonButton occurrenceId={lesson.id} async={lesson.deliveryMode === "async"}/></Suspense>}
      <LessonClientNotes studentId={lesson.studentId} name={name} occurrenceId={lesson.id} />
    </section>
  );
}
