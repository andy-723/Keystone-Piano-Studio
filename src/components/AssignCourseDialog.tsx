import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { assignCourseTemplate, getCourseAssignmentOptions } from "@/services/curriculum";
import { onboardingTerms, termName } from "@/lib/onboarding";
import type { CourseTemplate } from "@/mocks/types";
import { intakeField } from "./StudentIntake";

/** "Assign to students" from a studio course template in the Library. */
export function AssignCourseDialog({
  template,
  onClose,
}: {
  template: CourseTemplate;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const options = useQuery({
    queryKey: ["course-assignment-options"],
    queryFn: getCourseAssignmentOptions,
  });
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [targetTerm, setTargetTerm] = useState(onboardingTerms[1] ?? "2027-T3");
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };
  const visible = useMemo(
    () =>
      (options.data ?? []).filter((option) =>
        option.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [options.data, search],
  );
  const assign = useMutation({
    mutationFn: () =>
      assignCourseTemplate({
        templateId: template.id,
        studentIds: [...picked],
        targetTerm,
        replace: [...replace].filter((id) => picked.has(id)),
      }),
    onSuccess: async (result) => {
      await Promise.all(
        [
          "course-assignment-options",
          "course",
          "student-profile",
          "live-lesson",
          "parent",
          "chat-threads",
          "conversation",
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
      const skipped = result.skipped.length;
      toast.success(
        `${result.assigned.length} assigned${skipped ? `, ${skipped} skipped: already ${skipped === 1 ? "has a course" : "have a course"} or on this one` : ""}.`,
      );
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign “{template.name}”</DialogTitle>
          <DialogDescription>
            Each student gets their own copy. Students already on a course keep it unless you tick
            Replace; the old course is archived, never deleted.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            assign.mutate();
          }}
        >
          <label className="block font-semibold">
            Target term
            <select
              className={intakeField}
              value={targetTerm}
              onChange={(event) => setTargetTerm(event.target.value)}
            >
              {onboardingTerms.map((term) => (
                <option key={term} value={term}>
                  {termName(term)}
                </option>
              ))}
            </select>
          </label>
          <div className="relative">
            <Search aria-hidden className="absolute left-3 top-4 size-5 text-muted-foreground" />
            <input
              type="search"
              aria-label="Search students"
              placeholder="Search students"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-h-12 w-full rounded-md border-2 border-input bg-background py-2 pl-10 pr-3 text-base"
            />
          </div>
          {options.isPending ? (
            <p>Loading students…</p>
          ) : (
            <ul className="max-h-[45dvh] divide-y divide-border overflow-y-auto rounded-md border border-border">
              {visible.map((option) => {
                const onThis = option.currentCourse?.templateId === template.id;
                const checked = picked.has(option.studentId);
                return (
                  <li key={option.studentId} className="px-4 py-3">
                    <label className="flex min-h-12 items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-6 accent-primary"
                        checked={checked}
                        disabled={onThis}
                        onChange={(event) =>
                          setPicked((set) => toggle(set, option.studentId, event.target.checked))
                        }
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold">{option.name}</span>
                        <span className="block text-base text-muted-foreground">
                          {onThis
                            ? "Already on this course"
                            : option.currentCourse
                              ? `Now on ${option.currentCourse.name}`
                              : "No course yet"}
                        </span>
                      </span>
                    </label>
                    {checked && option.currentCourse && !onThis && (
                      <label className="ml-9 mt-1 flex min-h-12 items-center gap-3 text-base">
                        <input
                          type="checkbox"
                          className="size-5 accent-primary"
                          checked={replace.has(option.studentId)}
                          onChange={(event) =>
                            setReplace((set) => toggle(set, option.studentId, event.target.checked))
                          }
                        />
                        Replace current course (it will be archived)
                      </label>
                    )}
                  </li>
                );
              })}
              {!visible.length && <li className="px-4 py-3">No students match this search.</li>}
            </ul>
          )}
          {assign.error && (
            <p role="alert" className="text-destructive">
              {assign.error.message}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={!picked.size || assign.isPending}>
            <UserPlus aria-hidden />
            Assign to {picked.size} {picked.size === 1 ? "student" : "students"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
