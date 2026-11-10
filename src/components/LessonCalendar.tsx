import { useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCalendarAuth } from "@/lib/calendar-studio";
import { addDays, formatClock, fromMinutes, mondayOf, toMinutes } from "@/lib/lesson-calendar";
import { formatLongDate, formatShortDate } from "@/lib/format";
import {
  addLessonFn,
  cancelLessonFn,
  changeFromWeekFn,
  deleteLessonsFn,
  disconnectGoogleFn,
  endWeeklyLessonsFn,
  getCalendarWeekFn,
  moveLessonFn,
  restoreLessonFn,
  startGoogleConnectFn,
  syncGoogleNowFn,
  type CalendarLesson,
  type CalendarWeek,
} from "@/server/calendar";

const SLOT_MIN = 30;
const ROW_PX = 48;
const LENGTHS = [30, 45, 60, 90];

export const calendarWeekKey = (date: string) => ["lesson-calendar", date] as const;

export function calendarWeekQuery(date: string) {
  return {
    queryKey: calendarWeekKey(date),
    queryFn: async (): Promise<CalendarWeek> => {
      const auth = await getCalendarAuth();
      return getCalendarWeekFn({ data: { ...auth, date } });
    },
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
const isClash = (error: unknown) => errorMessage(error).includes("Save anyway");

export function LessonCalendar({ date }: { date: string }) {
  const query = useQuery(calendarWeekQuery(date));
  const [adding, setAdding] = useState<{ date: string; startTime: string } | null>(null);
  const [selected, setSelected] = useState<CalendarLesson | null>(null);

  if (query.isPending)
    return <p className="p-2 text-base text-muted-foreground">Opening the calendar…</p>;
  if (query.isError)
    return (
      <p role="alert" className="p-2 text-base text-destructive">
        {errorMessage(query.error)}
      </p>
    );
  const week = query.data;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.weekStart, i));

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Calendar</h1>
          <p className="mt-1 text-lg text-muted-foreground">
            {formatShortDate(week.weekStart)} – {formatShortDate(addDays(week.weekStart, 6))}
          </p>
        </div>
        <Button
          data-tour="calendar-add"
          onClick={() =>
            setAdding({
              date:
                week.today >= week.weekStart && week.today <= addDays(week.weekStart, 6)
                  ? week.today
                  : week.weekStart,
              startTime: "16:00",
            })
          }
        >
          <Plus aria-hidden /> Add lesson
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild>
          <Link to="/calendar" search={{ date: addDays(week.weekStart, -7) }}>
            <ChevronLeft aria-hidden /> Previous week
          </Link>
        </Button>
        {mondayOf(week.today) !== week.weekStart && (
          <Button variant="ghost" asChild>
            <Link to="/calendar" search={{}}>
              This week
            </Link>
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link to="/calendar" search={{ date: addDays(week.weekStart, 7) }}>
            Next week <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>

      <GoogleBar week={week} />

      {week.students.length === 0 && (
        <p className="mt-4 rounded-md border border-border bg-muted p-4 text-base">
          Add students first, then give them a lesson time here.{" "}
          <Link to="/students" className="underline">
            Go to Students
          </Link>
        </p>
      )}

      <WeekGrid week={week} days={days} onAdd={setAdding} onSelect={setSelected} />
      <DayList week={week} days={days} onAdd={setAdding} onSelect={setSelected} />

      <Dialog open={adding !== null} onOpenChange={(open) => !open && setAdding(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto p-5">
          <DialogTitle className="pr-10 text-2xl font-semibold">Add lesson</DialogTitle>
          <DialogDescription className="text-base">
            Pick the student and time. Weekly lessons repeat until you stop them.
          </DialogDescription>
          {adding && <AddLessonForm week={week} initial={adding} onDone={() => setAdding(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto p-5">
          {selected && (
            <LessonActions
              key={selected.key}
              lesson={selected}
              week={week}
              onDone={() => setSelected(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week grid (tablet and desktop) and day list (phone)
// ---------------------------------------------------------------------------
type GridProps = {
  week: CalendarWeek;
  days: string[];
  onAdd: (slot: { date: string; startTime: string }) => void;
  onSelect: (lesson: CalendarLesson) => void;
};

function lessonClasses(lesson: CalendarLesson) {
  if (lesson.status === "cancelled")
    return "border-border bg-muted text-muted-foreground line-through";
  if (lesson.status === "moved") return "border-dashed border-primary bg-primary/10";
  return "border-primary bg-primary/10";
}

function lessonLabel(lesson: CalendarLesson) {
  const status =
    lesson.status === "cancelled"
      ? ", cancelled"
      : lesson.status === "moved"
        ? ", moved this week"
        : "";
  return `${lesson.studentName}, ${formatShortDate(lesson.date)} ${formatClock(lesson.startTime)}, ${lesson.durationMin} minutes${status}`;
}

function WeekGrid({ week, days, onAdd, onSelect }: GridProps) {
  const { startMin, endMin } = useMemo(() => {
    let start = 7 * 60;
    let end = 21 * 60;
    for (const l of week.lessons) {
      start = Math.min(start, Math.floor(toMinutes(l.startTime) / 60) * 60);
      end = Math.max(end, Math.ceil((toMinutes(l.startTime) + l.durationMin) / 60) * 60);
    }
    return { startMin: start, endMin: end };
  }, [week.lessons]);
  const slots = Array.from(
    { length: (endMin - startMin) / SLOT_MIN },
    (_, i) => startMin + i * SLOT_MIN,
  );

  return (
    <div className="mt-6 hidden max-w-full overflow-x-auto md:block" aria-label="Week calendar">
      <div className="grid min-w-[900px] grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] border-t border-border">
        <div />
        {days.map((day) => (
          <div
            key={day}
            className={`border-l border-border px-2 py-2 text-center text-base font-semibold ${day === week.today ? "text-primary" : ""}`}
          >
            {formatShortDate(day)}
          </div>
        ))}
        <div className="relative">
          {slots.map((m) => (
            <div
              key={m}
              style={{ height: ROW_PX }}
              className="pr-2 text-right text-sm text-muted-foreground"
            >
              {m % 60 === 0 ? formatClock(fromMinutes(m)) : ""}
            </div>
          ))}
        </div>
        {days.map((day) => (
          <div key={day} className="relative border-l border-border">
            {slots.map((m) => (
              <button
                key={m}
                type="button"
                style={{ height: ROW_PX }}
                className={`block w-full border-t ${m % 60 === 0 ? "border-border" : "border-border/40"} hover:bg-accent focus-visible:bg-accent focus-visible:outline-none`}
                aria-label={`Add lesson ${formatShortDate(day)} ${formatClock(fromMinutes(m))}`}
                onClick={() => onAdd({ date: day, startTime: fromMinutes(m) })}
              />
            ))}
            {week.lessons
              .filter((l) => l.date === day)
              .map((lesson) => (
                <button
                  key={lesson.key}
                  type="button"
                  onClick={() => onSelect(lesson)}
                  aria-label={lessonLabel(lesson)}
                  style={{
                    top: ((toMinutes(lesson.startTime) - startMin) / SLOT_MIN) * ROW_PX + 1,
                    height: Math.max((lesson.durationMin / SLOT_MIN) * ROW_PX - 2, 28),
                  }}
                  className={`absolute inset-x-1 z-10 overflow-hidden rounded-md border-l-4 border px-2 py-1 text-left text-sm leading-tight shadow-sm ${lessonClasses(lesson)}`}
                >
                  <span className="block truncate font-semibold">{lesson.studentName}</span>
                  <span className="block truncate">
                    {formatClock(lesson.startTime)} · {lesson.durationMin} min
                    {lesson.status === "moved" ? " · moved" : ""}
                  </span>
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayList({ week, days, onAdd, onSelect }: GridProps) {
  return (
    <div className="mt-6 divide-y divide-border border-y border-border md:hidden">
      {days.map((day) => {
        const lessons = week.lessons.filter((l) => l.date === day);
        return (
          <section key={day} className="py-4">
            <h2 className={`text-xl font-semibold ${day === week.today ? "text-primary" : ""}`}>
              {formatShortDate(day)}
            </h2>
            <div className="mt-3 space-y-2">
              {lessons.map((lesson) => (
                <Button
                  key={lesson.key}
                  variant="outline"
                  className={`min-h-16 w-full justify-start whitespace-normal border-l-4 p-3 text-left ${lessonClasses(lesson)}`}
                  onClick={() => onSelect(lesson)}
                  aria-label={lessonLabel(lesson)}
                >
                  <span className="grid w-full grid-cols-[auto_1fr] gap-x-3">
                    <span className="text-lg font-semibold">{formatClock(lesson.startTime)}</span>
                    <span className="text-lg">{lesson.studentName}</span>
                    <span className="col-start-2 text-base font-normal">
                      {lesson.durationMin} min{lesson.repeat === "weekly" ? " · weekly" : ""}
                      {lesson.status === "moved" ? " · moved" : ""}
                      {lesson.status === "cancelled" ? " · cancelled" : ""}
                    </span>
                  </span>
                </Button>
              ))}
              {!lessons.length && <p className="text-base text-muted-foreground">No lessons.</p>}
              <Button variant="ghost" onClick={() => onAdd({ date: day, startTime: "16:00" })}>
                <Plus aria-hidden /> Add lesson on {formatShortDate(day)}
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Google Calendar bar
// ---------------------------------------------------------------------------
function GoogleBar({ week }: { week: CalendarWeek }) {
  const client = useQueryClient();
  const google = week.google;
  const failed = week.lessons.filter((l) => l.googleSyncStatus === "error").length;
  const connect = useMutation({
    mutationFn: async () => {
      const auth = await getCalendarAuth();
      const { url } = await startGoogleConnectFn({ data: auth });
      window.location.assign(url);
    },
  });
  const sync = useMutation({
    mutationFn: async () => syncGoogleNowFn({ data: await getCalendarAuth() }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["lesson-calendar"] }),
  });
  const disconnect = useMutation({
    mutationFn: async () => disconnectGoogleFn({ data: await getCalendarAuth() }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["lesson-calendar"] }),
  });
  const error = connect.error ?? sync.error ?? disconnect.error;

  if (!google.configured) {
    return (
      <p className="mt-4 text-base text-muted-foreground">
        Google Calendar sync isn&apos;t switched on for Keystone yet.
      </p>
    );
  }
  return (
    <div className="mt-4 rounded-md border border-border p-3" data-tour="calendar-google">
      {google.connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <CalendarCheck aria-hidden className="text-primary" />
          <p className="text-base">
            Sending your lessons to the <strong>Keystone lessons</strong> calendar in{" "}
            {google.email ?? "your Google account"}.
            {failed > 0 && (
              <span className="text-destructive">
                {" "}
                {failed} lesson{failed === 1 ? "" : "s"} this week didn&apos;t send.
              </span>
            )}
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
              <RefreshCw aria-hidden /> {sync.isPending ? "Syncing…" : "Sync now"}
            </Button>
            <Button
              variant="ghost"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Stop syncing
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <CalendarX aria-hidden className="text-muted-foreground" />
          <p className="text-base">
            {google.needsReconnect
              ? "Google stopped accepting Keystone's access. Connect again to keep your lessons in Google Calendar."
              : "See your lessons in Google Calendar. Keystone adds them to a separate “Keystone lessons” calendar and keeps it up to date."}
          </p>
          <Button className="ml-auto" disabled={connect.isPending} onClick={() => connect.mutate()}>
            {connect.isPending
              ? "Opening Google…"
              : google.needsReconnect
                ? "Reconnect Google Calendar"
                : "Connect Google Calendar"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base text-destructive">
          {errorMessage(error)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["lesson-calendar"] });
}

function TimeFields({
  date,
  setDate,
  time,
  setTime,
  length,
  setLength,
  dateLabel = "Day",
  min,
  max,
}: {
  date: string;
  setDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  length?: number;
  setLength?: (v: number) => void;
  dateLabel?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-base font-semibold">
        {dateLabel}
        <Input
          type="date"
          required
          className="mt-2 min-h-12 text-base md:text-base"
          value={date}
          min={min}
          max={max}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className="block text-base font-semibold">
        Start time
        <Input
          type="time"
          required
          step={300}
          className="mt-2 min-h-12 text-base md:text-base"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      {length !== undefined && setLength && (
        <div>
          <span id="lesson-length" className="block text-base font-semibold">
            Length
          </span>
          <Select value={String(length)} onValueChange={(v) => setLength(Number(v))}>
            <SelectTrigger aria-labelledby="lesson-length" className="mt-2 min-h-12 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...LENGTHS, length])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <SelectItem key={m} value={String(m)} className="min-h-11 text-base">
                    {m} minutes
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function SubmitRow({
  mutation,
  label,
  onSaveAnyway,
}: {
  mutation: { isPending: boolean; error: unknown };
  label: string;
  onSaveAnyway: () => void;
}) {
  return (
    <div className="space-y-3">
      {mutation.error != null && (
        <p role="alert" className="text-base text-destructive">
          {errorMessage(mutation.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : label}
        </Button>
        {isClash(mutation.error) && (
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={onSaveAnyway}
          >
            Save anyway
          </Button>
        )}
      </div>
    </div>
  );
}

function AddLessonForm({
  week,
  initial,
  onDone,
}: {
  week: CalendarWeek;
  initial: { date: string; startTime: string };
  onDone: () => void;
}) {
  const refresh = useRefresh();
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.startTime);
  const [length, setLength] = useState(30);
  const [weekly, setWeekly] = useState(true);
  const [until, setUntil] = useState("");
  const [location, setLocation] = useState("");
  const mutation = useMutation({
    mutationFn: async (allowClash: boolean) =>
      addLessonFn({
        data: {
          ...(await getCalendarAuth()),
          lesson: {
            studentId,
            date,
            startTime: time,
            durationMin: length,
            repeat: weekly ? "weekly" : "once",
            untilDate: weekly && until ? until : null,
            location,
            allowClash,
          },
        },
      }),
    onSuccess: async () => {
      await refresh();
      onDone();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate(false);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <span id="lesson-student" className="block text-base font-semibold">
          Student
        </span>
        <Select value={studentId} onValueChange={setStudentId}>
          <SelectTrigger aria-labelledby="lesson-student" className="mt-2 min-h-12 text-base">
            <SelectValue placeholder="Choose a student" />
          </SelectTrigger>
          <SelectContent>
            {week.students.map((s) => (
              <SelectItem key={s.id} value={s.id} className="min-h-11 text-base">
                {s.firstName} {s.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!week.students.length && (
          <p className="mt-2 text-base text-muted-foreground">
            No students yet. Enrol a student first.
          </p>
        )}
      </div>
      <TimeFields
        date={date}
        setDate={setDate}
        time={time}
        setTime={setTime}
        length={length}
        setLength={setLength}
        dateLabel="First lesson"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="How often">
        <Button
          type="button"
          variant={weekly ? "secondary" : "outline"}
          aria-pressed={weekly}
          onClick={() => setWeekly(true)}
        >
          Every week
        </Button>
        <Button
          type="button"
          variant={!weekly ? "secondary" : "outline"}
          aria-pressed={!weekly}
          onClick={() => setWeekly(false)}
        >
          Just this once
        </Button>
      </div>
      {weekly && (
        <label className="block text-base font-semibold">
          Last lesson (optional)
          <Input
            type="date"
            className="mt-2 min-h-12 text-base md:text-base"
            value={until}
            min={date}
            onChange={(e) => setUntil(e.target.value)}
          />
          <span className="mt-1 block text-sm font-normal text-muted-foreground">
            Leave empty to keep going every week. Cancel holiday weeks from the calendar.
          </span>
        </label>
      )}
      <label className="block text-base font-semibold">
        Where (optional)
        <Input
          className="mt-2 min-h-12 text-base md:text-base"
          value={location}
          maxLength={120}
          placeholder="Studio, online, student's home"
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>
      {studentId === "" && mutation.isIdle && (
        <p className="text-sm text-muted-foreground">Choose a student to save.</p>
      )}
      <SubmitRow
        mutation={mutation}
        label="Save lesson"
        onSaveAnyway={() => mutation.mutate(true)}
      />
    </form>
  );
}

type Mode = "menu" | "move" | "change" | "end" | "delete";

function LessonActions({
  lesson,
  week,
  onDone,
}: {
  lesson: CalendarLesson;
  week: CalendarWeek;
  onDone: () => void;
}) {
  const refresh = useRefresh();
  const [mode, setMode] = useState<Mode>("menu");
  const done = async () => {
    await refresh();
    onDone();
  };
  const auth = getCalendarAuth;

  const cancel = useMutation({
    mutationFn: async () =>
      cancelLessonFn({
        data: { ...(await auth()), seriesId: lesson.seriesId, originalDate: lesson.originalDate },
      }),
    onSuccess: done,
  });
  const restore = useMutation({
    mutationFn: async () =>
      restoreLessonFn({ data: { ...(await auth()), exceptionId: lesson.exceptionId ?? "" } }),
    onSuccess: done,
  });
  const weekly = lesson.repeat === "weekly";

  return (
    <div>
      <DialogTitle className="pr-10 text-2xl font-semibold">{lesson.studentName}</DialogTitle>
      <DialogDescription className="text-base">
        {formatLongDate(lesson.date)}, {formatClock(lesson.startTime)} · {lesson.durationMin}{" "}
        minutes
        {weekly
          ? ` · every ${new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: "UTC" }).format(new Date(`${lesson.originalDate}T12:00:00Z`))}`
          : " · one-off"}
        {lesson.location ? ` · ${lesson.location}` : ""}
      </DialogDescription>
      {lesson.status === "moved" && (
        <p className="mt-2 text-base">Moved from {formatLongDate(lesson.originalDate)}.</p>
      )}
      {lesson.status === "cancelled" && <p className="mt-2 text-base">Cancelled this week.</p>}
      {lesson.googleSyncStatus === "error" && (
        <p className="mt-2 text-base text-destructive">
          Not in Google Calendar yet: {lesson.googleSyncError}
        </p>
      )}

      {mode === "menu" && (
        <div className="mt-5 grid gap-2">
          {lesson.status !== "scheduled" && (
            <Button
              variant="secondary"
              disabled={restore.isPending}
              onClick={() => restore.mutate()}
            >
              <Undo2 aria-hidden /> Put back to the usual time
            </Button>
          )}
          {lesson.status !== "cancelled" && (
            <Button variant="outline" onClick={() => setMode("move")}>
              Move this {weekly ? "week only" : "lesson"}
            </Button>
          )}
          {lesson.status !== "cancelled" && (
            <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel this {weekly ? "week" : "lesson"}
            </Button>
          )}
          {weekly && (
            <Button variant="outline" onClick={() => setMode("change")}>
              Change day or time from this week on
            </Button>
          )}
          {weekly && (
            <Button variant="outline" onClick={() => setMode("end")}>
              Stop weekly lessons
            </Button>
          )}
          <Button variant="ghost" className="text-destructive" onClick={() => setMode("delete")}>
            Delete {weekly ? "all of these lessons" : "this lesson"}
          </Button>
          {(cancel.error ?? restore.error) != null && (
            <p role="alert" className="text-base text-destructive">
              {errorMessage(cancel.error ?? restore.error)}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Cancelling here doesn&apos;t give a make-up credit or change invoices yet.
          </p>
        </div>
      )}
      {mode === "move" && <MoveForm lesson={lesson} onDone={done} />}
      {mode === "change" && <ChangeForm lesson={lesson} onDone={done} />}
      {mode === "end" && <EndForm lesson={lesson} week={week} onDone={done} />}
      {mode === "delete" && <DeleteForm lesson={lesson} onDone={done} />}
      {mode !== "menu" && (
        <Button variant="ghost" className="mt-3" onClick={() => setMode("menu")}>
          Back
        </Button>
      )}
    </div>
  );
}

function MoveForm({ lesson, onDone }: { lesson: CalendarLesson; onDone: () => Promise<void> }) {
  const [date, setDate] = useState(lesson.date);
  const [time, setTime] = useState(lesson.startTime);
  const mutation = useMutation({
    mutationFn: async (allowClash: boolean) =>
      moveLessonFn({
        data: {
          ...(await getCalendarAuth()),
          seriesId: lesson.seriesId,
          originalDate: lesson.originalDate,
          newDate: date,
          newStartTime: time,
          allowClash,
        },
      }),
    onSuccess: onDone,
  });
  return (
    <form
      className="mt-5 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(false);
      }}
    >
      <TimeFields date={date} setDate={setDate} time={time} setTime={setTime} dateLabel="New day" />
      <SubmitRow
        mutation={mutation}
        label="Move lesson"
        onSaveAnyway={() => mutation.mutate(true)}
      />
    </form>
  );
}

function ChangeForm({ lesson, onDone }: { lesson: CalendarLesson; onDone: () => Promise<void> }) {
  const weekStart = mondayOf(lesson.originalDate);
  const [date, setDate] = useState(lesson.originalDate);
  const [time, setTime] = useState(lesson.startTime);
  const [length, setLength] = useState(lesson.durationMin);
  const mutation = useMutation({
    mutationFn: async (allowClash: boolean) =>
      changeFromWeekFn({
        data: {
          ...(await getCalendarAuth()),
          seriesId: lesson.seriesId,
          fromDate: lesson.originalDate,
          newDate: date,
          startTime: time,
          durationMin: length,
          allowClash,
        },
      }),
    onSuccess: onDone,
  });
  return (
    <form
      className="mt-5 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(false);
      }}
    >
      <p className="text-base">
        Lessons before {formatShortDate(lesson.originalDate)} stay as they were. From this week on
        the student comes at the new time every week.
      </p>
      <TimeFields
        date={date}
        setDate={setDate}
        time={time}
        setTime={setTime}
        length={length}
        setLength={setLength}
        dateLabel="New day this week"
        min={weekStart}
        max={addDays(weekStart, 6)}
      />
      <SubmitRow
        mutation={mutation}
        label="Change weekly time"
        onSaveAnyway={() => mutation.mutate(true)}
      />
    </form>
  );
}

function EndForm({
  lesson,
  week,
  onDone,
}: {
  lesson: CalendarLesson;
  week: CalendarWeek;
  onDone: () => Promise<void>;
}) {
  const [last, setLast] = useState(lesson.originalDate);
  const mutation = useMutation({
    mutationFn: async () =>
      endWeeklyLessonsFn({
        data: { ...(await getCalendarAuth()), seriesId: lesson.seriesId, lastDate: last },
      }),
    onSuccess: onDone,
  });
  return (
    <form
      className="mt-5 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <label className="block text-base font-semibold">
        Last lesson
        <Input
          type="date"
          required
          className="mt-2 min-h-12 text-base md:text-base"
          value={last}
          min={addDays(lesson.firstDate, -1)}
          onChange={(e) => setLast(e.target.value)}
        />
      </label>
      <p className="text-base text-muted-foreground">
        Lessons after this date are removed
        {week.google.connected ? ", in Keystone and in Google Calendar" : ""}. Past lessons stay.
      </p>
      {mutation.error != null && (
        <p role="alert" className="text-base text-destructive">
          {errorMessage(mutation.error)}
        </p>
      )}
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Stop after this date"}
      </Button>
    </form>
  );
}

function DeleteForm({ lesson, onDone }: { lesson: CalendarLesson; onDone: () => Promise<void> }) {
  const mutation = useMutation({
    mutationFn: async () =>
      deleteLessonsFn({ data: { ...(await getCalendarAuth()), seriesId: lesson.seriesId } }),
    onSuccess: onDone,
  });
  return (
    <div className="mt-5 space-y-4">
      <p className="text-base">
        This removes{" "}
        {lesson.repeat === "weekly"
          ? `every ${lesson.studentName} lesson in this weekly slot, past and future`
          : "this lesson"}
        . Use it for a mistake. To stop lessons from a date, use &ldquo;Stop weekly lessons&rdquo;
        instead.
      </p>
      {mutation.error != null && (
        <p role="alert" className="text-base text-destructive">
          {errorMessage(mutation.error)}
        </p>
      )}
      <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}
