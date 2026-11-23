import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invalidateAttendance } from "@/components/AttendanceMarker";
import { calendarApi } from "@/lib/calendar-api";
import { formatLongDate, formatShortDate } from "@/lib/format";
import { addDays, formatClock } from "@/lib/lesson-calendar";
import { ATTENDANCE_LABELS, CREDIT_REASON_LABELS, type CreditLot } from "@/lib/makeup-credits";
import { students, teacher } from "@/mocks/data";
import { getOrCreateFamilyConversation, sendMessage } from "@/services/chat";
import type { LessonRecordRow, StudentMakeUps } from "@/server/attendance";

/**
 * Student profile on a real studio (0025): make-up credits with their expiry, booking a make-up
 * into a free time, and the last 12 weeks of lessons with their marks.
 */
export const studentMakeUpsQuery = (studentId: string) => ({
  queryKey: ["student-makeups", studentId],
  queryFn: (): Promise<StudentMakeUps> => calendarApi.studentMakeUps(studentId),
});

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

const STATUS_LABEL: Record<LessonRecordRow["status"], string> = {
  ...ATTENDANCE_LABELS,
  not_marked: "Not marked",
  cancelled: "Cancelled",
};

function creditLine(lot: CreditLot, data: StudentMakeUps) {
  const booking = data.bookings.find((entry) => entry.creditId === lot.id);
  if (lot.state === "booked")
    return booking
      ? `Booked for ${formatLongDate(booking.date)}, ${formatClock(booking.startTime)}`
      : "Used for a make-up";
  if (lot.state === "expired") return `Expired ${formatShortDate(lot.expiresOn)}`;
  return `Use by ${formatShortDate(lot.expiresOn)}`;
}

/** Tells the family in chat. Best effort: the booking stands even if the message fails. */
async function tellFamily(studentId: string, date: string, startTime: string) {
  const student = students.find((entry) => entry.id === studentId);
  if (!student) return false;
  try {
    const conversation = await getOrCreateFamilyConversation(student.familyId);
    await sendMessage({
      conversationId: conversation.id,
      authorName: teacher.name || "Your teacher",
      authorRole: "teacher",
      kind: "text",
      body: `${student.firstName}'s make-up lesson is booked for ${formatLongDate(date)}, ${formatClock(startTime)}.`,
    });
    return true;
  } catch (error) {
    console.error("[make-ups] family not told", (error as Error).message);
    return false;
  }
}

export function LiveStudentMakeUps({ studentId, name }: { studentId: string; name: string }) {
  const client = useQueryClient();
  const query = useQuery(studentMakeUpsQuery(studentId));
  const data = query.data;
  const [date, setDate] = useState("");
  const [time, setTime] = useState("16:00");
  const [length, setLength] = useState<number | null>(null);
  const [told, setTold] = useState<boolean | null>(null);
  const book = useMutation({
    mutationFn: async (allowClash: boolean) => {
      const durationMin = length ?? data?.defaultDurationMin ?? 30;
      await calendarApi.bookMakeUp({ studentId, date, startTime: time, durationMin, allowClash });
      return tellFamily(studentId, date, time);
    },
    onSuccess: async (sent) => {
      setTold(sent);
      setDate("");
      await invalidateAttendance(client);
    },
  });
  const extend = useMutation({
    mutationFn: (creditId: string) => calendarApi.extendCredit({ studentId, creditId }),
    onSuccess: () => invalidateAttendance(client),
  });
  const remove = useMutation({
    mutationFn: (seriesId: string) => calendarApi.deleteLessons(seriesId),
    onSuccess: () => invalidateAttendance(client),
  });

  if (query.isPending)
    return (
      <section className="border-t border-border py-7">
        <p className="text-muted-foreground">Loading make-ups and attendance…</p>
      </section>
    );
  if (query.isError || !data)
    return (
      <section className="border-t border-border py-7">
        <p role="alert" className="text-destructive">
          {errorText(query.error)}
        </p>
      </section>
    );

  const shown = data.credits.filter((lot) => lot.state !== "undone");
  const marked = data.history.filter((row) => row.status !== "not_marked");
  const attended = data.history.filter((row) => row.status === "attended").length;
  const firstName = name.split(" ")[0] ?? name;

  return (
    <>
      <section className="border-t border-border py-7" aria-labelledby="makeups-heading">
        <h2 id="makeups-heading" className="text-2xl font-semibold">
          Make-up lessons · {data.balance} owed
        </h2>
        <p className="mt-2 text-base text-muted-foreground">
          Your studio terms: make-ups {data.lessonRules.makeUpAllowance}. {firstName} earned{" "}
          {data.earnedRecently} in the last 90 days. Credits last 90 days.
        </p>
        {shown.length > 0 ? (
          <ul className="mt-4 divide-y divide-border">
            {shown.map((lot) => {
              const booking = data.bookings.find((entry) => entry.creditId === lot.id);
              return (
                <li key={lot.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p>{CREDIT_REASON_LABELS[lot.reason]}</p>
                    <p
                      className={`text-base ${lot.state === "expired" ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {creditLine(lot, data)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(lot.state === "available" || lot.state === "expired") && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={extend.isPending}
                        onClick={() => extend.mutate(lot.id)}
                      >
                        Extend 30 days
                      </Button>
                    )}
                    {booking && booking.date >= data.today && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(booking.seriesId)}
                      >
                        Remove make-up and give credit back
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-muted-foreground">
            No make-up credits. A lesson cancelled by the studio, or by the family with notice,
            earns one.
          </p>
        )}
        {(extend.error ?? remove.error) != null && (
          <p role="alert" className="mt-2 text-base text-destructive">
            {errorText(extend.error ?? remove.error)}
          </p>
        )}

        {data.balance > 0 && (
          <form
            className="mt-6 space-y-4 rounded-md border border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              setTold(null);
              book.mutate(false);
            }}
          >
            <h3 className="text-xl font-semibold">Book a make-up</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="makeup-date">Day</Label>
                <Input
                  id="makeup-date"
                  type="date"
                  min={data.today}
                  max={addDays(data.today, 365)}
                  required
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="makeup-time">Start time</Label>
                <Input
                  id="makeup-time"
                  type="time"
                  step={300}
                  required
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="makeup-length">Minutes</Label>
                <Input
                  id="makeup-length"
                  type="number"
                  min={10}
                  max={240}
                  step={5}
                  value={length ?? data.defaultDurationMin}
                  onChange={(event) => setLength(Number(event.target.value))}
                />
              </div>
            </div>
            {book.error != null && (
              <p role="alert" className="text-base text-destructive">
                {errorText(book.error)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={book.isPending || !date}>
                {book.isPending ? "Booking…" : "Book make-up"}
              </Button>
              {errorText(book.error).includes("Save anyway") && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={book.isPending}
                  onClick={() => book.mutate(true)}
                >
                  Save anyway
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Uses the credit that runs out first. The lesson goes on the calendar and the family
              gets a chat message.
            </p>
          </form>
        )}
        {told !== null && (
          <p role="status" className="mt-3 text-base">
            Make-up booked.{" "}
            {told ? "The family has been told in chat." : "Let the family know in chat."}
          </p>
        )}
      </section>

      <section className="border-t border-border py-7" aria-labelledby="attendance-history">
        <h2 id="attendance-history" className="text-2xl font-semibold">
          Attendance history
        </h2>
        <p className="mt-2 text-base text-muted-foreground">
          Last 12 weeks · {attended} attended of {data.history.length} lessons
          {data.history.length > marked.length
            ? ` · ${data.history.length - marked.length} not marked`
            : ""}
        </p>
        <div className="mt-4 divide-y divide-border">
          {data.history.map((row) => (
            <div key={row.key} className="flex flex-wrap justify-between gap-3 py-4">
              <p>
                {formatShortDate(row.date)}
                {row.startTime ? ` · ${formatClock(row.startTime)}` : ""}
              </p>
              <span
                className={`text-base font-semibold ${row.status === "absent" || row.status === "cancelled_late" ? "text-destructive" : row.status === "attended" ? "text-success" : "text-muted-foreground"}`}
              >
                {STATUS_LABEL[row.status]}
                {row.credit ? " · credit" : ""}
              </span>
            </div>
          ))}
        </div>
        {!data.history.length && (
          <p className="mt-4 text-muted-foreground">No lessons in the last 12 weeks.</p>
        )}
      </section>
    </>
  );
}
