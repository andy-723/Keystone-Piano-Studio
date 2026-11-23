import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatShortDate } from "@/lib/format";
import { TASK_MARK_LABEL, type FamilyTask } from "@/lib/live-assignments";
import { liveStudioId } from "@/lib/studio-workspace";
import { getParentSession } from "@/services/parent";
import { completeLiveFamilyTask, familyPortalState } from "@/services/live/family-store";

/**
 * Family home on a real studio (0026): this week's practice tasks per child. Ticking a task off
 * logs the minutes as today's practice; once the teacher marks a task, the mark and comment show.
 * No recordings on real studios yet (Pro, needs media storage).
 */
const liveParentTasksQuery = {
  queryKey: ["parent", "live-assignments"],
  queryFn: async () => {
    const { children } = await getParentSession();
    return {
      children: children.map((child) => ({ id: child.id, firstName: child.firstName })),
      assignments: structuredClone(familyPortalState.assignments),
    };
  },
};

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

function taskLine(task: FamilyTask) {
  if (task.mark) return `Teacher’s mark: ${TASK_MARK_LABEL[task.mark]}`;
  return task.doneAt ? "Done" : "Not done yet";
}

export function LiveParentAssignments() {
  const query = useQuery(liveParentTasksQuery);
  const client = useQueryClient();
  const [task, setTask] = useState<FamilyTask | null>(null);
  const [minutes, setMinutes] = useState("15");
  const tick = useMutation({
    mutationFn: () => {
      const studioId = liveStudioId();
      if (!task || !studioId) throw new Error("Choose a task.");
      return completeLiveFamilyTask(studioId, task.id, Number(minutes));
    },
    onSuccess: async () => {
      setTask(null);
      await client.invalidateQueries({ queryKey: ["parent"] });
    },
  });
  if (!query.data?.assignments.length) return null;
  const { assignments, children } = query.data;
  return (
    <section data-tour="family-assignments" className="mt-6 border-y border-border py-6">
      <h2 className="text-2xl font-semibold">Practice tasks</h2>
      {assignments.map((assignment) => (
        <div className="mt-5 border-b border-border pb-5" key={assignment.id}>
          <h3 className="text-xl font-semibold">
            <span data-no-translate>
              {children.find((child) => child.id === assignment.studentId)?.firstName}
            </span>{" "}
            · Due {formatShortDate(assignment.dueDate)}
          </h3>
          {assignment.tasks.map((entry) => (
            <div key={entry.id} className="mt-4">
              <label className="flex min-h-12 cursor-pointer items-center gap-3">
                <input
                  className="size-7 shrink-0 accent-primary"
                  type="checkbox"
                  checked={Boolean(entry.doneAt)}
                  disabled={Boolean(entry.doneAt) || Boolean(entry.mark)}
                  onChange={() => {
                    tick.reset();
                    setMinutes(String(entry.minutesPerDay));
                    setTask(entry);
                  }}
                />
                <span data-no-translate className="break-words font-semibold">
                  {entry.text}
                </span>
              </label>
              <p className="ml-10 text-muted-foreground">
                {entry.daysPerWeek} days × {entry.minutesPerDay} min · {taskLine(entry)}
              </p>
              {entry.attachmentTitle && (
                <p className="ml-10 mt-1 break-words">
                  Attached:{" "}
                  {entry.attachmentUrl ? (
                    <a
                      className="text-primary underline"
                      href={entry.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {entry.attachmentTitle}
                    </a>
                  ) : (
                    <span className="font-semibold">{entry.attachmentTitle}</span>
                  )}
                </p>
              )}
              {entry.markComment && (
                <p data-no-translate className="ml-10 mt-1 border-l-2 border-border pl-3">
                  {entry.markComment}
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
      <Dialog
        open={Boolean(task)}
        onOpenChange={(open) => {
          if (!open) setTask(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Practice minutes</DialogTitle>
          </DialogHeader>
          <p data-no-translate className="break-words font-semibold">
            {task?.text}
          </p>
          <label>
            Minutes practised today
            <Input
              className="mt-2 min-h-12"
              type="number"
              min={1}
              max={600}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          <Button disabled={tick.isPending} onClick={() => tick.mutate()}>
            <Check aria-hidden /> {tick.isPending ? "Saving…" : "Mark done and save practice"}
          </Button>
          {tick.error && <p role="alert">{errorText(tick.error)}</p>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
