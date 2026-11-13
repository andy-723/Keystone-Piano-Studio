import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense } from "react";
import { LatestNews } from "@/components/StudioNews";
import { calendarWeekQuery } from "@/components/LessonCalendar";
import { Button } from "@/components/ui/button";
import { formatLongDate } from "@/lib/format";
import { addDays, formatClock } from "@/lib/lesson-calendar";
import { studioToday } from "@/lib/studio-clock";
import type { CalendarLesson } from "@/server/calendar";

/**
 * Today page for a real studio: the real date in the studio's time zone and the studio's own
 * lessons from the calendar (lesson_series + lesson_exception). Attendance, lesson notes and
 * practice are not saved for real studios yet, so this page leaves them out (pilot, 13 Nov 2026).
 */
export function LiveToday({ date }: { date?: string | undefined }) {
  const today = studioToday();
  const day = date ?? today;
  const query = useQuery(calendarWeekQuery(day));
  const lessons: CalendarLesson[] = (query.data?.lessons ?? [])
    .filter((lesson) => lesson.date === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const active = lessons.filter((lesson) => lesson.status !== "cancelled");

  return (
    <div className="mx-auto max-w-4xl">
      <Suspense fallback={null}>
        <LatestNews />
      </Suspense>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-wrap sm:justify-between sm:gap-3">
        <Button variant="outline" className="px-2 sm:px-3 md:px-5" asChild>
          <Link to="/" search={{ date: addDays(day, -1) }}>
            <ChevronLeft aria-hidden /> Previous day
          </Link>
        </Button>
        {day !== today && (
          <Button variant="ghost" className="col-span-2 row-start-2 sm:order-none" asChild>
            <Link to="/" search={{}}>
              Back to today
            </Link>
          </Button>
        )}
        <Button variant="outline" className="col-start-2 row-start-1 px-2 sm:px-3 md:px-5" asChild>
          <Link to="/" search={{ date: addDays(day, 1) }}>
            Next day <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>

      <article className="mt-6 daybook-page px-4 py-6 pl-8 md:px-10 md:py-8 md:pl-24">
        <p className="text-base font-semibold uppercase text-muted-foreground">
          {day === today ? "Today" : "Day-book"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold md:text-5xl">{formatLongDate(day)}</h1>
        {query.data && (
          <p className="mt-2 text-lg text-muted-foreground">
            {active.length === 1 ? "1 lesson" : `${active.length} lessons`}
          </p>
        )}

        <div className="mt-8 space-y-5">
          {query.isPending && <p className="text-lg text-muted-foreground">Opening the page…</p>}
          {query.isError && (
            <p role="alert" className="text-lg text-destructive">
              {query.error instanceof Error
                ? query.error.message
                : "The day-book could not be opened. Please refresh to try again."}
            </p>
          )}
          {query.data && lessons.length === 0 && (
            <p className="text-lg text-muted-foreground">
              No lessons on this day. Add lesson times for your students on the calendar.
            </p>
          )}
          {lessons.map((lesson) => (
            <section
              key={lesson.key}
              aria-label={`${formatClock(lesson.startTime)}, ${lesson.studentName}`}
              className={`rounded-lg border-2 bg-card p-4 md:p-6 ${lesson.status === "cancelled" ? "border-border opacity-70" : "border-input"}`}
            >
              <div className="grid min-w-0 gap-1 sm:flex sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-6">
                <div className="grid min-w-0 gap-1 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-5">
                  <span className="shrink-0 whitespace-nowrap font-display text-2xl font-semibold text-primary md:text-3xl">
                    {formatClock(lesson.startTime)}
                  </span>
                  <h2 className="min-w-0 break-words font-sans text-2xl font-bold">
                    {lesson.studentName}
                  </h2>
                </div>
                <span className="text-lg text-muted-foreground">
                  {lesson.durationMin} min
                  {lesson.location ? ` · ${lesson.location}` : ""}
                </span>
              </div>
              {lesson.status === "cancelled" && (
                <p className="mt-3 text-base font-semibold">Cancelled this week.</p>
              )}
              {lesson.status === "moved" && (
                <p className="mt-3 text-base font-semibold">Moved to this time for this week.</p>
              )}
              {lesson.note && <p className="mt-3 text-base text-muted-foreground">{lesson.note}</p>}
            </section>
          ))}
        </div>

        <p className="mt-8">
          <Button variant="outline" asChild>
            <Link to="/calendar" search={{ date: day }}>
              <CalendarDays aria-hidden /> Open the calendar to add, move or cancel lessons
            </Link>
          </Button>
        </p>
      </article>
    </div>
  );
}
