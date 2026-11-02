import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, X, BookOpenText, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PROTOTYPE_TODAY, addDays } from "@/lib/calendar";
import { formatLongDate, formatTime } from "@/lib/format";
import { getDayLessons, markAttendance, type DayPlan, type LessonWithDetails } from "@/services/schedule";
import type { LessonStatus } from "@/mocks/types";

const dayQuery = (date: string) => queryOptions({ queryKey: ["day", date], queryFn: () => getDayLessons(date) });

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { date?: string } =>
    typeof s["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["date"]) ? { date: s["date"] } : {},
  loaderDeps: ({ search }) => ({ date: search.date ?? PROTOTYPE_TODAY }),
  loader: async ({ context, deps }) => { await context.queryClient.ensureQueryData(dayQuery(deps.date)); },
  errorComponent: () => <p role="alert">The day-book could not be opened. Please refresh to try again.</p>,
  notFoundComponent: () => <p>No day-book page found.</p>,
  head: () => ({
    meta: [
      { title: "Today — Opus day-book" },
      { name: "description", content: "Today's piano lessons, listed by time like a paper day-book." },
      { property: "og:title", content: "Today — Opus day-book" },
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
  const done = data?.lessons.filter((l) => l.status !== "scheduled").length ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" className="px-3 md:px-5" asChild>
          <Link to="/" search={{ date: addDays(date, -1) }}><ChevronLeft aria-hidden /> Previous day</Link>
        </Button>
        {date !== PROTOTYPE_TODAY && (
          <Button variant="ghost" asChild><Link to="/" search={{}}>Back to today</Link></Button>
        )}
        <Button variant="outline" className="px-3 md:px-5" asChild>
          <Link to="/" search={{ date: addDays(date, 1) }}>Next day <ChevronRight aria-hidden /></Link>
        </Button>
      </div>

      <article className="mt-6 daybook-page px-4 py-6 pl-8 md:px-10 md:py-8 md:pl-24">
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
      </article>
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
      qc.invalidateQueries({ queryKey: ["day", date] });
      toast.success(status === "scheduled" ? `${name}: mark cleared` : `${name} marked: ${STATUS_LABEL[status]}`);
    },
  });
  const marked = lesson.status !== "scheduled";

  return (
    <section
      aria-label={`${formatTime(lesson.startsAt)}, ${name}`}
      className={`rounded-lg border-2 bg-card p-4 md:p-6 ${marked ? "border-border" : "border-input"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="whitespace-nowrap font-display text-2xl font-semibold text-primary md:text-3xl">{formatTime(lesson.startsAt)}</span>
          <h2 className="font-sans text-2xl font-bold">{name}</h2>
        </div>
        <span className="text-lg text-muted-foreground">{lesson.lessonType.name} · {lesson.gradeGoal}</span>
      </div>

      {marked ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`inline-flex min-h-12 items-center gap-2 rounded-lg px-4 text-lg font-bold ${lesson.status === "attended" ? "bg-success-soft text-success" : lesson.status === "absent" ? "bg-warning-soft text-foreground" : "bg-muted text-muted-foreground"}`}>
            {lesson.status === "attended" ? <Check aria-hidden /> : <X aria-hidden />}
            {STATUS_LABEL[lesson.status]}
          </span>
          <Button variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate("scheduled")}><Undo2 aria-hidden /> Undo</Button>
          <Button variant="outline" className="ml-auto" onClick={() => toast("Live Lesson is coming next")}>
            <BookOpenText aria-hidden /> Open lesson
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
          <Button variant="outline" size="lg" onClick={() => toast("Live Lesson is coming next")}>
            <BookOpenText aria-hidden /> Open lesson
          </Button>
          <div className="flex flex-wrap gap-3 sm:col-span-3">
            <Button variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate("cancelled_by_studio")}>
              Cancelled by studio
            </Button>
            <Button variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate("cancelled_late")}>
              Late cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
