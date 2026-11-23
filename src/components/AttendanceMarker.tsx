import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { calendarApi } from "@/lib/calendar-api";
import {
  ATTENDANCE_LABELS,
  earnsCredit,
  isCancellation,
  type AttendanceStatus,
  type StudioLessonRules,
} from "@/lib/makeup-credits";
import type { CalendarLesson } from "@/server/calendar";

/**
 * Marks one lesson (0025): one tap for Attended, or a short form for the other outcomes with the
 * make-up credit choice (D2). Future lessons can only be marked as cancelled. Shared by the Today
 * page and the calendar's lesson dialog.
 */
export function invalidateAttendance(client: ReturnType<typeof useQueryClient>) {
  return Promise.all(
    ["lesson-calendar", "student-makeups", "studio-snapshot"].map((key) =>
      client.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

const PAST_CHOICES: AttendanceStatus[] = [
  "attended",
  "absent",
  "cancelled_by_studio",
  "cancelled_with_notice",
  "cancelled_late",
];
const FUTURE_CHOICES: AttendanceStatus[] = [
  "cancelled_by_studio",
  "cancelled_with_notice",
  "cancelled_late",
];

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The mark wasn't saved. Please try again.";
}

export function AttendanceMarker({
  lesson,
  today,
  rules,
  credits,
  cancelOnly = false,
  onDone,
}: {
  lesson: CalendarLesson;
  today: string;
  rules: StudioLessonRules;
  credits: { balance: number; earnedRecently: number } | undefined;
  /** The calendar's "Cancel" button: only the three cancellation choices. */
  cancelOnly?: boolean;
  onDone?: () => void;
}) {
  const client = useQueryClient();
  const future = lesson.date > today;
  const mark = lesson.attendance;
  // Cancelled on the calendar before marks existed: only "who cancelled" makes sense.
  const cancelChoices = cancelOnly || future || (lesson.status === "cancelled" && !mark);
  const [open, setOpen] = useState(cancelOnly);
  const [status, setStatus] = useState<AttendanceStatus | null>(mark?.status ?? null);
  const [giveCredit, setGiveCredit] = useState<boolean | null>(mark ? mark.credit : null);
  const save = useMutation({
    mutationFn: (input: { status: AttendanceStatus | null; giveCredit?: boolean | null }) =>
      calendarApi.markLesson({
        seriesId: lesson.seriesId,
        originalDate: lesson.originalDate,
        status: input.status,
        giveCredit: input.giveCredit ?? null,
      }),
    onSuccess: async () => {
      await invalidateAttendance(client);
      setOpen(false);
      onDone?.();
    },
  });
  const choices = cancelChoices ? FUTURE_CHOICES : PAST_CHOICES;
  const credit = status ? (status === "attended" ? false : earnsCredit(status, giveCredit)) : false;
  const firstName = lesson.studentName.split(" ")[0] ?? lesson.studentName;

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="attendance-marker">
        {mark ? (
          <>
            <p className="mr-2 text-base font-semibold">
              {mark.status === "attended" && <Check aria-hidden className="mr-1 inline size-4" />}
              {ATTENDANCE_LABELS[mark.status]}
              {mark.credit ? " · make-up credit" : ""}
            </p>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              Change
            </Button>
          </>
        ) : cancelChoices ? (
          <Button variant="outline" onClick={() => setOpen(true)}>
            {lesson.status === "cancelled" ? "Record who cancelled" : "Mark as cancelled"}
          </Button>
        ) : (
          <>
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate({ status: "attended" })}
              aria-label={`Mark ${lesson.studentName} attended`}
            >
              <Check aria-hidden /> Attended
            </Button>
            <Button variant="outline" onClick={() => setOpen(true)}>
              Absent or cancelled…
            </Button>
          </>
        )}
        {save.error != null && (
          <p role="alert" className="w-full text-base text-destructive">
            {errorText(save.error)}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="mt-4 space-y-4 rounded-md border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (status) save.mutate({ status, giveCredit: status === "attended" ? null : giveCredit });
      }}
    >
      <fieldset>
        <legend className="text-lg font-semibold">
          {cancelChoices ? "Who cancelled?" : "What happened?"}
        </legend>
        <div className="mt-2 grid gap-2">
          {choices.map((choice) => (
            <label key={choice} className="flex min-h-11 items-center gap-3 text-base">
              <input
                type="radio"
                name={`mark-${lesson.key}`}
                className="size-5 accent-primary"
                checked={status === choice}
                onChange={() => {
                  setStatus(choice);
                  setGiveCredit(null);
                }}
              />
              {ATTENDANCE_LABELS[choice]}
              {choice === "cancelled_with_notice" && (
                <span className="text-muted-foreground">
                  ({rules.cancelNoticeHours} hours or more)
                </span>
              )}
            </label>
          ))}
        </div>
      </fieldset>
      {status && status !== "attended" && (
        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-3 text-base">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={credit}
              disabled={status === "cancelled_by_studio"}
              onChange={(event) => setGiveCredit(event.target.checked)}
            />
            {status === "cancelled_by_studio"
              ? "Gives a make-up credit (always, when the studio cancels)"
              : status === "cancelled_with_notice"
                ? "Give a make-up credit"
                : "Give a make-up anyway (goodwill)"}
          </label>
          <p className="text-sm text-muted-foreground">
            Your studio terms: {rules.cancelNoticeHours} hours&apos; notice, make-ups{" "}
            {rules.makeUpAllowance}. {firstName} has earned {credits?.earnedRecently ?? 0} make-up
            credit{credits?.earnedRecently === 1 ? "" : "s"} in the last 90 days.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!status || save.isPending}>
          Save
        </Button>
        {mark && (
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => save.mutate({ status: null })}
          >
            <Undo2 aria-hidden />{" "}
            {isCancellation(mark.status) ? "Clear mark and put the lesson back" : "Clear mark"}
          </Button>
        )}
        {!cancelOnly && (
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        )}
      </div>
      {save.error != null && (
        <p role="alert" className="text-base text-destructive">
          {errorText(save.error)}
        </p>
      )}
      <p className="text-sm text-muted-foreground">Marking a lesson never changes an invoice.</p>
    </form>
  );
}
