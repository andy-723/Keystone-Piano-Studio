import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/LiveLessonTasks";
import { formatShortDate } from "@/lib/format";
import { addDays } from "@/lib/lesson-calendar";
import { studioToday } from "@/lib/studio-clock";
import { practiceLogs } from "@/mocks/data";
import { deleteLivePractice, liveAssignmentsQuery } from "@/services/live/assignment-store";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

/**
 * Student profile on a real studio: practice tasks with their ticks and marks (0026), and the
 * last 8 weeks of practice entries, each of which staff can delete (0023).
 */
export function LiveStudentAssignments({ studentId }: { studentId: string }) {
  const query = useQuery(liveAssignmentsQuery(studentId));
  return (
    <section className="border-t border-border py-7" aria-labelledby="practice-tasks">
      <h2 id="practice-tasks" className="text-2xl font-semibold">
        Practice tasks
      </h2>
      <p className="mt-2 text-base text-muted-foreground">
        Set and mark tasks from the lesson card on Today.
      </p>
      {query.isPending && <p className="mt-4">Opening practice tasks…</p>}
      {query.error && (
        <p role="alert" className="mt-4">
          {errorText(query.error)}
        </p>
      )}
      {query.data?.length === 0 && (
        <p className="mt-4 text-muted-foreground">No practice tasks yet.</p>
      )}
      <div className="mt-4 divide-y divide-border">
        {query.data?.slice(0, 8).map((assignment) => (
          <div key={assignment.id} className="py-4">
            <p className="font-semibold">
              {`Lesson ${formatShortDate(assignment.lessonDate)} · due ${formatShortDate(assignment.dueDate)}${assignment.markedAt ? " · Marked" : ""}`}
            </p>
            <TaskList assignment={assignment} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function LivePracticeEntries({ studentId }: { studentId: string }) {
  const client = useQueryClient();
  const since = addDays(studioToday(), -55);
  const entries = practiceLogs
    .filter((entry) => entry.studentId === studentId && entry.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date));
  const remove = useMutation({
    mutationFn: deleteLivePractice,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["student-profile"] }),
        client.invalidateQueries({ queryKey: ["live-assignments"] }),
      ]);
      toast.success("Practice entry deleted");
    },
    onError: (error) => toast.error(errorText(error)),
  });
  return (
    <section className="border-t border-border py-7" aria-labelledby="practice-entries">
      <h2 id="practice-entries" className="text-2xl font-semibold">
        Practice entries
      </h2>
      {!entries.length && (
        <p className="mt-4 text-muted-foreground">No practice logged in the last 8 weeks.</p>
      )}
      <ul className="mt-4 divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span>
              {formatShortDate(entry.date)} · {entry.minutes} min ·{" "}
              {entry.loggedBy === "teacher" ? "In lesson" : "At home"}
            </span>
            <Button
              variant="ghost"
              disabled={remove.isPending}
              aria-label={`Delete ${entry.minutes} min on ${formatShortDate(entry.date)}`}
              onClick={() => remove.mutate(entry.id)}
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
