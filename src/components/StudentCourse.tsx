import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProgressRing } from "./ProgressRing";
import { recordCourseFeedback, saveStudentCourse, type getStudentCourse } from "@/services/curriculum";
import { termLabel } from "@/lib/course-progress";
import type { CourseItem, CourseStage, Feedback } from "@/mocks/types";

export type CourseData = Awaited<ReturnType<typeof getStudentCourse>>;
export async function refreshCourse(client: ReturnType<typeof useQueryClient>) {
  await Promise.all(["live-lesson", "student-profile", "parent", "course"].map((key) => client.invalidateQueries({ queryKey: [key] })));
}
export function StageBar({ stage, names }: { stage: CourseStage; names: CourseData["stageNames"] }) {
  return <div className="mt-3 max-w-sm"><div className="grid h-2 grid-cols-5 gap-1" aria-hidden>{[1, 2, 3, 4, 5].map((step) => <span key={step} className={step <= stage ? "rounded-sm bg-success" : "rounded-sm bg-border"} />)}</div><p className="mt-2 text-base font-semibold text-success">{names[stage]}</p></div>;
}
export function StudentCourse({ data, occurrenceId, locked, reminders = [], showHeader = true }: { data: CourseData; occurrenceId?: string; locked?: boolean; reminders?: string[]; showHeader?: boolean }) {
  const [editing, setEditing] = useState(false);
  return <section aria-label="Course" className="border-t border-border py-7">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-semibold">Course</h2>{!occurrenceId && <Button variant="outline" onClick={() => setEditing(true)}><Pencil aria-hidden /> Edit course</Button>}</div>
    {showHeader && <div className="mt-5 flex flex-wrap items-center justify-between gap-5"><div><p className="text-xl font-semibold">{data.course.framework} · {data.course.grade}</p><p className="mt-2">Target {termLabel(data.course.targetTerm)}</p><p className="mt-1 text-base text-muted-foreground">Weekly goal · {data.course.weeklyPracticeGoalMin} min</p></div><ProgressRing percent={data.readiness} /></div>}
    {reminders.map((name) => <p role="status" key={name} className="mt-4 border-l-4 border-warning bg-warning-soft p-4 text-base">{name} hasn't come up in 3 lessons.</p>)}
    {data.sections.map((section) => <section key={section.id} className="mt-6" aria-label={section.name}><div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2"><h3 className="text-xl font-semibold">{section.name}</h3><span className="text-base text-muted-foreground">{section.weightPct}% · {data.weightLabel.toLowerCase()}</span></div>
      {data.items.filter((item) => item.sectionId === section.id).map((item) => <div key={item.id} className="border-b border-border py-5"><p className="text-base text-muted-foreground">{data.slots.find((slot) => slot.id === item.slotId)?.label}</p><h4 className="break-words text-lg font-semibold">{item.title}</h4>{item.composer && <p className="text-base text-muted-foreground">{item.composer}</p>}<StageBar stage={item.stage} names={data.stageNames} /><div className="mt-2 flex flex-wrap gap-5 text-base text-muted-foreground">{item.targetBpm !== undefined && <p>{item.currentBpm ?? 0} / {item.targetBpm} bpm</p>}{item.barsTotal !== undefined && <p>{item.barsDone ?? 0} of {item.barsTotal} bars</p>}</div>{occurrenceId && <Checkpoint item={item} data={data} occurrenceId={occurrenceId} locked={locked} />}</div>)}
      {!data.items.some((item) => item.sectionId === section.id) && <p className="py-4 text-muted-foreground">No items yet.</p>}
    </section>)}
    {!occurrenceId && <div className="mt-7"><h3 className="text-xl font-semibold">Term milestones</h3>{data.milestones.map((milestone) => { const item = data.items.find((entry) => entry.id === milestone.courseItemId); return item ? <p key={milestone.id} className="mt-3 text-base">End of {termLabel(milestone.termKey)}: {data.slots.find((slot) => slot.id === item.slotId)?.label ?? item.title} at stage {milestone.targetStage} · {data.stageNames[milestone.targetStage]}</p> : null; })}{!data.milestones.length && <p className="mt-3 text-muted-foreground">No milestones set.</p>}</div>}
    {editing && <CourseEditor data={data} onClose={() => setEditing(false)} />}
  </section>;
}
function Checkpoint({ item, data, occurrenceId, locked }: { item: CourseItem; data: CourseData; occurrenceId: string; locked?: boolean }) {
  const client = useQueryClient();
  const [stage, setStage] = useState<CourseStage>(Math.min(5, item.stage + 1) as CourseStage);
  const [comment, setComment] = useState("");
  const [shared, setShared] = useState(false);
  const mutation = useMutation({ mutationFn: (outcome: Feedback["outcome"]) => recordCourseFeedback({ studentId: data.course.studentId, courseItemId: item.id, occurrenceId, outcome, newStage: stage, comment, shared }), onSuccess: async () => { await refreshCourse(client); setComment(""); toast.success("Checkpoint saved"); }, onError: (error) => toast.error(error.message) });
  const latest = data.feedback.filter((entry) => entry.courseItemId === item.id && entry.occurrenceId === occurrenceId).at(-1);
  return <div className="mt-4 space-y-3"><label className="block text-base">Short comment (optional)<Input className="mt-2 min-h-12" value={comment} maxLength={400} disabled={locked || mutation.isPending} onChange={(event) => setComment(event.target.value)} /></label><label className="flex min-h-12 items-center gap-3 text-base"><input type="checkbox" checked={shared} disabled={locked || mutation.isPending} onChange={(event) => setShared(event.target.checked)} className="size-5" /> Share comment with family</label>
    <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={locked || mutation.isPending} onClick={() => mutation.mutate("pass")}><Check aria-hidden /> Pass checkpoint</Button><label className="text-base">Stage<select aria-label={`Stage for ${item.title}`} className="ml-2 min-h-12 rounded-md border border-input bg-card p-2" value={stage} onChange={(event) => setStage(Number(event.target.value) as CourseStage)} disabled={locked || mutation.isPending}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><Button variant="outline" disabled={locked || mutation.isPending} onClick={() => mutation.mutate("stage_move")}>Move to stage {stage}</Button><Button variant="ghost" disabled={locked || mutation.isPending} onClick={() => mutation.mutate("carry_over")}>Carry over</Button></div>
    {latest && <p role="status" className="text-base text-muted-foreground">{latest.outcome === "carry_over" ? "Carried over" : "Checkpoint saved"}{latest.comment ? ` · ${latest.comment}` : ""}{latest.comment ? latest.shared ? " · Shared" : " · Private" : ""}</p>}
  </div>;
}
function CourseEditor({ data, onClose }: { data: CourseData; onClose: () => void }) {
  const [targetTerm, setTargetTerm] = useState(data.course.targetTerm);
  const [items, setItems] = useState(data.items.map((item) => ({ ...item })));
  const client = useQueryClient();
  const save = useMutation({ mutationFn: () => saveStudentCourse(data.course.studentId, { targetTerm, items }), onSuccess: async () => { await refreshCourse(client); onClose(); toast.success("Course saved"); }, onError: (error) => toast.error(error.message) });
  const patch = (id: string, update: Partial<CourseItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  return <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Edit course</DialogTitle></DialogHeader><form onSubmit={(event) => { event.preventDefault(); save.mutate(); }} className="space-y-6"><label className="block text-base">Target term<select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card p-3" value={targetTerm} onChange={(event) => setTargetTerm(event.target.value)}>{[1, 2, 3, 4].map((term) => <option key={term} value={`2027-T${term}`}>Term {term} 2027</option>)}</select></label>
    {data.sections.map((section) => <div key={section.id}><h3 className="text-xl font-semibold">{section.name}</h3>{items.filter((item) => item.sectionId === section.id).map((item) => <div key={item.id} className="space-y-3 border-b border-border py-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-base">Piece / item title<Input required className="mt-2 min-h-12" value={item.title} onChange={(event) => patch(item.id, { title: event.target.value })} /></label><label className="text-base">Composer<Input className="mt-2 min-h-12" value={item.composer ?? ""} onChange={(event) => patch(item.id, { composer: event.target.value })} /></label></div><div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-0 flex-1 text-base">Slot<select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card p-3" value={item.slotId ?? ""} onChange={(event) => patch(item.id, { slotId: event.target.value || undefined })}><option value="">No slot</option>{data.slots.filter((slot) => slot.sectionId === section.id).map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select></label><Button type="button" variant="ghost" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 aria-hidden /> Remove item</Button></div></div>)}<Button type="button" className="mt-3" variant="outline" onClick={() => setItems((current) => [...current, { id: crypto.randomUUID(), studentCourseId: data.course.id, sectionId: section.id, title: "", stage: 1, updatedAt: new Date().toISOString() }])}><Plus aria-hidden /> Add item</Button></div>)}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={save.isPending}>Save course</Button><Button type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>Cancel</Button></div>
  </form></DialogContent></Dialog>;
}