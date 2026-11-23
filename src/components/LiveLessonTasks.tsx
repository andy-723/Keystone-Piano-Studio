import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatShortDate } from "@/lib/format";
import { addDays } from "@/lib/lesson-calendar";
import {
  DEFAULT_DUE_DAYS,
  TASK_MARKS,
  TASK_MARK_LABEL,
  assignmentToMark,
  type LiveAssignment,
  type LiveTask,
  type TaskDraft,
  type TaskMark,
} from "@/lib/live-assignments";
import { getStudentCourse } from "@/services/curriculum";
import {
  deleteLiveAssignment,
  liveAttachableLibrary,
  liveAssignmentsQuery,
  markLiveAssignment,
  saveLiveAssignment,
} from "@/services/live/assignment-store";

/**
 * Practice tasks on a real studio's Today lesson card (0026): mark last lesson's tasks first,
 * then set this week's. Base and Pro both; recordings stay Pro and demo-only.
 */
const field = "mt-2 min-h-12 w-full rounded-md border border-input bg-card px-3 text-lg";
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

export function taskStatus(task: LiveTask) {
  if (task.mark) return TASK_MARK_LABEL[task.mark];
  return task.doneAt ? "Ticked off at home" : "Not ticked off yet";
}

export function LiveLessonTasks({
  studentId,
  studentName,
  occurrenceKey,
  lessonDate,
}: {
  studentId: string;
  studentName: string;
  occurrenceKey: string;
  lessonDate: string;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ ...liveAssignmentsQuery(studentId), enabled: open });
  const current = query.data?.find((entry) => entry.occurrenceKey === occurrenceKey) ?? null;
  return (
    <>
      <Button variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
        <ClipboardList aria-hidden /> Practice tasks
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8 text-2xl">{`Practice tasks · ${studentName}`}</DialogTitle>
            <DialogDescription className="text-base">{`Lesson ${formatShortDate(lessonDate)}`}</DialogDescription>
          </DialogHeader>
          {query.isPending && <p>Opening practice tasks…</p>}
          {query.error && <p role="alert">{errorText(query.error)}</p>}
          {query.data && (
            <>
              <MarkTasks assignment={assignmentToMark(query.data, lessonDate)} />
              {current?.tasks.some((task) => task.mark) ? (
                <section className="mt-6 border-t border-border pt-5">
                  <h3 className="text-xl font-semibold">This week’s tasks</h3>
                  <TaskList assignment={current} />
                </section>
              ) : (
                <TaskEditor
                  key={current?.id ?? "new"}
                  studentId={studentId}
                  occurrenceKey={occurrenceKey}
                  lessonDate={lessonDate}
                  current={current}
                  previous={query.data.find((entry) => entry.lessonDate < lessonDate) ?? null}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Read-only tasks with their tick and mark. */
export function TaskList({ assignment }: { assignment: LiveAssignment }) {
  return (
    <ul className="mt-3 space-y-3">
      {assignment.tasks.map((task) => (
        <li key={task.id} className="border-l-2 border-border pl-4">
          <p data-no-translate className="break-words font-semibold">
            {task.text}
          </p>
          <p className="text-base text-muted-foreground">
            {task.daysPerWeek} days × {task.minutesPerDay} min · {taskStatus(task)}
          </p>
          {task.attachmentTitle && (
            <p className="text-base">
              Attached:{" "}
              {task.attachmentUrl ? (
                <a
                  className="text-primary underline"
                  href={task.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {task.attachmentTitle}
                </a>
              ) : (
                task.attachmentTitle
              )}
            </p>
          )}
          {task.markComment && (
            <p data-no-translate className="mt-1">
              {task.markComment}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function MarkTasks({ assignment }: { assignment: LiveAssignment | null }) {
  const client = useQueryClient();
  const [marks, setMarks] = useState<Record<string, { mark?: TaskMark; comment: string }>>({});
  const save = useMutation({
    mutationFn: () => {
      if (!assignment) throw new Error("Nothing to mark.");
      return markLiveAssignment(
        assignment,
        assignment.tasks.flatMap((task) => {
          const entry = marks[task.id];
          return !task.mark && entry?.mark
            ? [{ taskId: task.id, mark: entry.mark, comment: entry.comment }]
            : [];
        }),
      );
    },
    onSuccess: async () => {
      setMarks({});
      await Promise.all([
        client.invalidateQueries({ queryKey: ["live-assignments"] }),
        client.invalidateQueries({ queryKey: ["student-profile"] }),
      ]);
      toast.success("Marks saved and shared with the family");
    },
  });
  if (!assignment) return null;
  const open = assignment.tasks.filter((task) => !task.mark);
  return (
    <section className="mt-2 border-b border-border pb-5" aria-label="Mark last lesson’s tasks">
      <h3 className="text-xl font-semibold">{`Mark tasks from ${formatShortDate(assignment.lessonDate)}`}</h3>
      <p className="mt-1 text-base text-muted-foreground">
        Marks and comments are shared with the family. Done well moves a linked course item up one
        stage.
      </p>
      {open.map((task) => (
        <fieldset key={task.id} className="mt-4 min-w-0 border-t border-border pt-3">
          <legend data-no-translate className="break-words font-semibold">
            {task.text}
          </legend>
          <p className="text-base text-muted-foreground">{taskStatus(task)}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Mark">
            {TASK_MARKS.map((mark) => (
              <Button
                key={mark}
                type="button"
                role="radio"
                aria-checked={marks[task.id]?.mark === mark}
                variant={marks[task.id]?.mark === mark ? "secondary" : "outline"}
                onClick={() =>
                  setMarks({
                    ...marks,
                    [task.id]: { comment: marks[task.id]?.comment ?? "", mark },
                  })
                }
              >
                {TASK_MARK_LABEL[mark]}
              </Button>
            ))}
          </div>
          <label className="mt-3 block text-base">
            Comment for the family (optional)
            <textarea
              className="mt-2 w-full rounded-md border border-input bg-card p-3 text-lg"
              rows={2}
              maxLength={1000}
              value={marks[task.id]?.comment ?? ""}
              onChange={(event) =>
                setMarks({
                  ...marks,
                  [task.id]: { ...marks[task.id], comment: event.target.value },
                })
              }
            />
          </label>
        </fieldset>
      ))}
      <Button
        className="mt-4"
        disabled={save.isPending || !open.some((task) => marks[task.id]?.mark)}
        onClick={() => save.mutate()}
      >
        <CheckCircle2 aria-hidden /> {save.isPending ? "Saving marks…" : "Save marks"}
      </Button>
      {save.error && (
        <p role="alert" className="mt-3 text-destructive">
          {errorText(save.error)}
        </p>
      )}
    </section>
  );
}

const blankTask = (): TaskDraft => ({
  id: crypto.randomUUID(),
  text: "",
  minutesPerDay: 10,
  daysPerWeek: 5,
});

function TaskEditor({
  studentId,
  occurrenceKey,
  lessonDate,
  current,
  previous,
}: {
  studentId: string;
  occurrenceKey: string;
  lessonDate: string;
  current: LiveAssignment | null;
  previous: LiveAssignment | null;
}) {
  const client = useQueryClient();
  const course = useQuery({
    queryKey: ["live-assignment-course", studentId],
    queryFn: () => getStudentCourse(studentId),
  });
  const library = liveAttachableLibrary();
  const [tasks, setTasks] = useState<TaskDraft[]>(
    current?.tasks.map((task) => ({
      id: task.id,
      text: task.text,
      minutesPerDay: task.minutesPerDay,
      daysPerWeek: task.daysPerWeek,
      courseItemId: task.courseItemId ?? undefined,
      attachmentTitle: task.attachmentTitle ?? undefined,
      attachmentUrl: task.attachmentUrl ?? undefined,
    })) ?? [],
  );
  const [dueDate, setDueDate] = useState(current?.dueDate ?? addDays(lessonDate, DEFAULT_DUE_DAYS));
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["live-assignments"] }),
      client.invalidateQueries({ queryKey: ["chat-threads"] }),
      client.invalidateQueries({ queryKey: ["messages"] }),
    ]);
  const save = useMutation({
    mutationFn: () => saveLiveAssignment({ studentId, occurrenceKey, lessonDate, dueDate, tasks }),
    onSuccess: async () => {
      await refresh();
      toast.success("Practice tasks sent to the family chat");
    },
  });
  const remove = useMutation({
    mutationFn: () => (current ? deleteLiveAssignment(current) : Promise.resolve()),
    onSuccess: async () => {
      setTasks([]);
      await refresh();
      toast.success("Practice tasks deleted");
    },
  });
  const update = (id: string, patch: Partial<TaskDraft>) =>
    setTasks(tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  const copy = (unfinished: boolean) =>
    setTasks(
      (previous?.tasks ?? [])
        .filter(
          (task) =>
            !unfinished || !task.doneAt || task.mark === "keep_going" || task.mark === "needs_work",
        )
        .map((task) => ({
          id: crypto.randomUUID(),
          text: task.text,
          minutesPerDay: task.minutesPerDay,
          daysPerWeek: task.daysPerWeek,
          courseItemId: task.courseItemId ?? undefined,
          attachmentTitle: task.attachmentTitle ?? undefined,
          attachmentUrl: task.attachmentUrl ?? undefined,
        })),
    );
  const total = tasks.reduce((sum, task) => sum + task.minutesPerDay * task.daysPerWeek, 0);
  const items = course.data?.items ?? [];
  return (
    <section className="mt-6" aria-label="Set this week’s tasks">
      <h3 className="text-xl font-semibold">
        {current ? "This week’s tasks" : "Set this week’s tasks"}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" disabled={!previous} onClick={() => copy(false)}>
          Repeat last week
        </Button>
        <Button variant="outline" disabled={!previous} onClick={() => copy(true)}>
          Carry over unfinished
        </Button>
      </div>
      {items.length > 0 && (
        <label className="mt-4 block font-semibold">
          Add from course
          <select
            className={field}
            value=""
            onChange={(event) => {
              const item = items.find((entry) => entry.id === event.target.value);
              if (item)
                setTasks([...tasks, { ...blankTask(), text: item.title, courseItemId: item.id }]);
            }}
          >
            <option value="">Pick a course item</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <Button className="mt-3" variant="ghost" onClick={() => setTasks([...tasks, blankTask()])}>
        <Plus aria-hidden /> Add task
      </Button>
      {tasks.map((task) => (
        <fieldset key={task.id} className="mt-4 min-w-0 border-t border-border pt-4">
          <label className="block font-semibold">
            Task
            <Input
              className={field}
              maxLength={300}
              value={task.text}
              onChange={(event) => update(task.id, { text: event.target.value })}
            />
          </label>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label>
              Minutes per day
              <Input
                className={field}
                type="number"
                min={1}
                max={240}
                value={task.minutesPerDay}
                onChange={(event) => update(task.id, { minutesPerDay: Number(event.target.value) })}
              />
            </label>
            <label>
              Days per week
              <Input
                className={field}
                type="number"
                min={1}
                max={7}
                value={task.daysPerWeek}
                onChange={(event) => update(task.id, { daysPerWeek: Number(event.target.value) })}
              />
            </label>
          </div>
          {library.length > 0 && (
            <label className="mt-3 block">
              Attach from Library
              <select
                className={field}
                value={library.find((item) => item.url === task.attachmentUrl)?.id ?? ""}
                onChange={(event) => {
                  const item = library.find((entry) => entry.id === event.target.value);
                  update(task.id, { attachmentTitle: item?.title, attachmentUrl: item?.url });
                }}
              >
                <option value="">No attachment</option>
                {library.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            variant="ghost"
            onClick={() => setTasks(tasks.filter((entry) => entry.id !== task.id))}
          >
            <Trash2 aria-hidden /> Remove task
          </Button>
        </fieldset>
      ))}
      {tasks.length > 0 && <p className="mt-4 text-lg font-semibold">{`${total} min a week`}</p>}
      <label className="mt-4 block">
        Due date
        <Input
          className={field}
          type="date"
          min={lessonDate}
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
      </label>
      <Button
        className="mt-5 w-full"
        disabled={save.isPending || !tasks.length}
        onClick={() => save.mutate()}
      >
        <Send aria-hidden />{" "}
        {save.isPending ? "Sending…" : current ? "Save and tell the family" : "Send to family"}
      </Button>
      {save.error && (
        <p role="alert" className="mt-3 text-destructive">
          {errorText(save.error)}
        </p>
      )}
      {current && (
        <Button
          className="mt-3"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          <Trash2 aria-hidden /> Delete these tasks
        </Button>
      )}
      {remove.error && (
        <p role="alert" className="mt-3 text-destructive">
          {errorText(remove.error)}
        </p>
      )}
    </section>
  );
}
