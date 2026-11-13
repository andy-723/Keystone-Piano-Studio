import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProgressRing } from "./ProgressRing";
import { recordCourseFeedback, saveStudentCourse, scoreCourseItem, startBenchmarkCourse, type getStudentCourse } from "@/services/curriculum";
import { currentTermKey, termAfterKey, termLabel, termOptions } from "@/lib/course-progress";
import { formatNumericDate } from "@/lib/format";
import { BENCHMARK_LEVELS, PATHWAYS, PILLARS, type BenchmarkPathway } from "@/lib/benchmarks";
import type { CourseItem, CourseItemKind, CourseStage, Feedback, FrameworkSection } from "@/mocks/types";

const SCORE_LABEL: Record<CourseItemKind, Record<number, string>> = {
  piece: {},
  technical: { 0: "Not started", 50: "In progress", 100: "Mastered at tempo" },
  checklist: { 0: "Not yet", 100: "Done" },
};
/** The kind of item a section holds: from its items, else from the benchmark pillar name. */
function sectionKind(section: Pick<FrameworkSection, "id" | "name">, items: CourseItem[]): CourseItemKind {
  const found = items.find((item) => item.sectionId === section.id && item.kind)?.kind;
  if (found) return found;
  return PILLARS.find((pillar) => pillar.name === section.name)?.kind ?? "piece";
}
export function ScoreChip({ item }: { item: CourseItem }) {
  const kind = item.kind ?? "piece";
  const score = item.score ?? 0;
  return <p className={`mt-2 text-base font-semibold ${score === 100 ? "text-success" : score === 50 ? "text-warning" : "text-muted-foreground"}`}>{SCORE_LABEL[kind][score]}</p>;
}

export type CourseData = Awaited<ReturnType<typeof getStudentCourse>>;
export async function refreshCourse(client: ReturnType<typeof useQueryClient>) {
  await Promise.all(["live-lesson", "student-profile", "parent", "course"].map((key) => client.invalidateQueries({ queryKey: [key] })));
}
export function StageBar({ stage, names }: { stage: CourseStage; names: CourseData["stageNames"] }) {
  return <div className="mt-3 max-w-sm">
    <div className="grid h-2 grid-cols-5 gap-1" aria-hidden>{[1, 2, 3, 4, 5].map((step) => <span key={step} className={step <= stage ? "rounded-sm bg-success" : "rounded-sm bg-border"} />)}</div>
    <p className="mt-2 text-base font-semibold text-success">Stage {stage} of 5 · {names[stage]}</p>
  </div>;
}
export function StudentCourse({ data, occurrenceId, locked, reminders = [], showHeader = true }: { data: CourseData; occurrenceId?: string; locked?: boolean | undefined; reminders?: string[]; showHeader?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState(false);
  return <section aria-label="Course" className="border-t border-border py-7">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-semibold">Course</h2>{!occurrenceId && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setStarting(true)}><Layers aria-hidden /> Start from benchmark</Button><Button variant="outline" onClick={() => setEditing(true)}><Pencil aria-hidden /> Edit course</Button></div>}</div>
    {showHeader && <div className="mt-5 flex flex-wrap items-center justify-between gap-5"><div><p className="text-xl font-semibold">{data.course.framework} · {data.course.grade}</p><p className="mt-2">Target {termLabel(data.course.targetTerm)}</p><p className="mt-1 text-base text-muted-foreground">Weekly goal · {data.course.weeklyPracticeGoalMin} min</p><p className="mt-1 text-base text-muted-foreground">{data.lastSignOffAt ? `Last sign-off · ${formatNumericDate(data.lastSignOffAt.slice(0, 10))}` : "No sign-offs yet"}</p>{data.benchmark && <p className="mt-1 text-base text-muted-foreground">Keystone benchmark · {data.benchmark.label}</p>}<p className="mt-3 max-w-xl text-base text-muted-foreground">Pieces move through five stages; scales are in progress or mastered; theory and ear items are ticked off. The ring weights each section — it is a guide, not a letter grade or exam result.</p></div><div className="space-y-2 text-center"><ProgressRing percent={data.readiness} /><p className="max-w-[11rem] text-sm text-muted-foreground">Course readiness from stages 1–5</p></div></div>}
    {reminders.map((name) => <p role="status" key={name} className="mt-4 border-l-4 border-warning bg-warning-soft p-4 text-base">{name} hasn't come up in 3 lessons.</p>)}
    {data.sections.map((section) => <section key={section.id} className="mt-6" aria-label={section.name}><div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2"><h3 className="text-xl font-semibold">{section.name}</h3><span className="text-base text-muted-foreground">{section.weightPct}% · {data.weightLabel.toLowerCase()}</span></div>
      {data.items.filter((item) => item.sectionId === section.id).map((item) => <div key={item.id} className="border-b border-border py-5"><p className="text-base text-muted-foreground">{data.slots.find((slot) => slot.id === item.slotId)?.label}</p><h4 className="break-words text-lg font-semibold">{item.title}</h4>{item.composer && <p className="text-base text-muted-foreground">{item.composer}</p>}{(item.kind ?? "piece") === "piece" ? <StageBar stage={item.stage} names={data.stageNames} /> : <ScoreChip item={item} />}<div className="mt-2 flex flex-wrap gap-5 text-base text-muted-foreground">{item.targetBpm !== undefined && <p>{item.currentBpm ?? 0} / {item.targetBpm} bpm</p>}{item.barsTotal !== undefined && <p>{item.barsDone ?? 0} of {item.barsTotal} bars</p>}</div>{occurrenceId && ((item.kind ?? "piece") === "piece" ? <Checkpoint item={item} data={data} occurrenceId={occurrenceId} locked={locked} /> : <ScoreButtons item={item} data={data} occurrenceId={occurrenceId} locked={locked} />)}</div>)}
      {!data.items.some((item) => item.sectionId === section.id) && <p className="py-4 text-muted-foreground">No items yet.</p>}
    </section>)}
    {!occurrenceId && <div className="mt-7"><h3 className="text-xl font-semibold">Term milestones</h3>{data.milestones.map((milestone) => { const item = data.items.find((entry) => entry.id === milestone.courseItemId); return item ? <p key={milestone.id} className="mt-3 text-base">End of {termLabel(milestone.termKey)}: {data.slots.find((slot) => slot.id === item.slotId)?.label ?? item.title} at stage {milestone.targetStage} · {data.stageNames[milestone.targetStage]}</p> : null; })}{!data.milestones.length && <p className="mt-3 text-muted-foreground">No milestones set.</p>}</div>}
    {editing && <CourseEditor data={data} onClose={() => setEditing(false)} />}
    {starting && <BenchmarkStarter data={data} onClose={() => setStarting(false)} />}
  </section>;
}
function Checkpoint({ item, data, occurrenceId, locked }: { item: CourseItem; data: CourseData; occurrenceId: string; locked?: boolean | undefined }) {
  const client = useQueryClient();
  const [stage, setStage] = useState<CourseStage>(Math.min(5, item.stage + 1) as CourseStage);
  const [comment, setComment] = useState("");
  const [shared, setShared] = useState(false);
  const mutation = useMutation({ mutationFn: (outcome: Feedback["outcome"]) => recordCourseFeedback({ studentId: data.course.studentId, courseItemId: item.id, occurrenceId, outcome, newStage: stage, comment, shared }), onSuccess: async () => { await refreshCourse(client); setComment(""); toast.success("Checkpoint saved"); }, onError: (error) => toast.error(error.message) });
  const latest = data.feedback.filter((entry) => entry.courseItemId === item.id && entry.occurrenceId === occurrenceId).at(-1);
  return <div className="mt-4 space-y-3"><label className="block text-base">Short comment (optional)<Input className="mt-2 min-h-12" value={comment} maxLength={400} disabled={locked || mutation.isPending} onChange={(event) => setComment(event.target.value)} /></label><label className="flex min-h-12 items-center gap-3 text-base"><input type="checkbox" checked={shared} disabled={locked || mutation.isPending} onChange={(event) => setShared(event.target.checked)} className="size-5" /> Share comment with family</label>
    <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={locked || mutation.isPending} onClick={() => mutation.mutate("pass")}><Check aria-hidden /> Pass checkpoint</Button><label className="text-base">Stage<select aria-label={`Stage for ${item.title}`} className="ml-2 min-h-12 rounded-md border border-input bg-card p-2" value={stage} onChange={(event) => setStage(Number(event.target.value) as CourseStage)} disabled={locked || mutation.isPending}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {data.stageNames[n as CourseStage]}</option>)}</select></label><Button variant="outline" disabled={locked || mutation.isPending} onClick={() => mutation.mutate("stage_move")}>Move to stage {stage} · {data.stageNames[stage]}</Button><Button variant="ghost" disabled={locked || mutation.isPending} onClick={() => mutation.mutate("carry_over")}>Carry over</Button></div>
    {latest && <p role="status" className="text-base text-muted-foreground">{latest.outcome === "carry_over" ? "Carried over" : "Checkpoint saved"}{latest.comment ? ` · ${latest.comment}` : ""}{latest.comment ? latest.shared ? " · Shared" : " · Private" : ""}</p>}
  </div>;
}
function ScoreButtons({ item, data, occurrenceId, locked }: { item: CourseItem; data: CourseData; occurrenceId: string; locked?: boolean | undefined }) {
  const client = useQueryClient();
  const kind = item.kind === "technical" ? "technical" : "checklist";
  const mutation = useMutation({ mutationFn: (score: 0 | 50 | 100) => scoreCourseItem({ studentId: data.course.studentId, courseItemId: item.id, score, occurrenceId }), onSuccess: async () => { await refreshCourse(client); toast.success("Saved"); }, onError: (error) => toast.error(error.message) });
  const scores: (0 | 50 | 100)[] = kind === "technical" ? [0, 50, 100] : [0, 100];
  return <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Score for ${item.title}`}>{scores.map((score) => <Button key={score} type="button" variant={(item.score ?? 0) === score ? "secondary" : "outline"} aria-pressed={(item.score ?? 0) === score} disabled={locked || mutation.isPending} onClick={() => mutation.mutate(score)}>{SCORE_LABEL[kind][score]}</Button>)}</div>;
}
function BenchmarkStarter({ data, onClose }: { data: CourseData; onClose: () => void }) {
  const client = useQueryClient();
  const [levelId, setLevelId] = useState<string>(data.benchmark?.id ?? "foundation");
  const [pathway, setPathway] = useState<BenchmarkPathway>(data.course.framework === "Custom" ? "recreational" : data.course.framework);
  const [targetTerm, setTargetTerm] = useState(data.course.targetTerm || termAfterKey(currentTermKey(new Date()), 2));
  const level = BENCHMARK_LEVELS.find((entry) => entry.id === levelId);
  const start = useMutation({ mutationFn: () => startBenchmarkCourse(data.course.studentId, { levelId, pathway, targetTerm }), onSuccess: async () => { await refreshCourse(client); onClose(); toast.success("Benchmark course started"); }, onError: (error) => toast.error(error.message) });
  return <Dialog open onOpenChange={(open) => { if (!open && !start.isPending) onClose(); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Start from the Keystone benchmark</DialogTitle></DialogHeader><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); start.mutate(); }}>
    <label className="block text-base">Level<select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card p-3" value={levelId} onChange={(event) => setLevelId(event.target.value)}>{BENCHMARK_LEVELS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {entry.stage}</option>)}</select></label>
    <label className="block text-base">Pathway<select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card p-3" value={pathway} onChange={(event) => setPathway(event.target.value as BenchmarkPathway)}>{PATHWAYS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
    <label className="block text-base">Goal term<select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card p-3" value={targetTerm} onChange={(event) => setTargetTerm(event.target.value)}>{termOptions(targetTerm).map((key) => <option key={key} value={key}>{termLabel(key)}</option>)}</select></label>
    {level && <div className="rounded-md border border-border p-4 text-base"><p className="font-semibold">What you get</p><ul className="mt-2 list-disc space-y-1 pl-5">{PILLARS.map((pillar) => <li key={pillar.id}>{pillar.name} ({pillar.weightPct}%): {pillar.kind === "piece" ? `${level.pieces} empty slots for your pieces` : `${level.pillars[pillar.id].items.length} items`}</li>)}</ul><p className="mt-3 text-muted-foreground">Keystone's own guide, not an exam board syllabus. Exam boards' technical and piece lists aren't included, so add your pieces in Edit course.</p></div>}
    {data.items.length > 0 && <p role="note" className="border-l-4 border-warning bg-warning-soft p-3 text-base">The current course is archived with its history, and the family sees the new one.</p>}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={start.isPending}>Start course</Button><Button type="button" variant="ghost" disabled={start.isPending} onClick={onClose}>Cancel</Button></div>
  </form></DialogContent></Dialog>;
}
function CourseEditor({ data, onClose }: { data: CourseData; onClose: () => void }) {
  const [targetTerm, setTargetTerm] = useState(data.course.targetTerm);
  const [items, setItems] = useState(data.items.map((item) => ({ ...item })));
  const client = useQueryClient();
  const save = useMutation({ mutationFn: () => saveStudentCourse(data.course.studentId, { targetTerm, items }), onSuccess: async () => { await refreshCourse(client); onClose(); toast.success("Course saved"); }, onError: (error) => toast.error(error.message) });
  const patch = (id: string, update: Partial<CourseItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  return <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Edit course</DialogTitle></DialogHeader><form onSubmit={(event) => { event.preventDefault(); save.mutate(); }} className="space-y-6"><label className="block text-base">Target term<select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card p-3" value={targetTerm} onChange={(event) => setTargetTerm(event.target.value)}>{termOptions(data.course.targetTerm).map((key) => <option key={key} value={key}>{termLabel(key)}</option>)}</select></label>
    {data.sections.map((section) => <div key={section.id}><h3 className="text-xl font-semibold">{section.name}</h3>{items.filter((item) => item.sectionId === section.id).map((item) => <div key={item.id} className="space-y-3 border-b border-border py-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-base">Piece / item title<Input required className="mt-2 min-h-12" value={item.title} onChange={(event) => patch(item.id, { title: event.target.value })} /></label><label className="text-base">Composer<Input className="mt-2 min-h-12" value={item.composer ?? ""} onChange={(event) => patch(item.id, { composer: event.target.value })} /></label></div><div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-0 flex-1 text-base">Slot<select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card p-3" value={item.slotId ?? ""} onChange={(event) => patch(item.id, { slotId: event.target.value || undefined })}><option value="">No slot</option>{data.slots.filter((slot) => slot.sectionId === section.id).map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select></label><Button type="button" variant="ghost" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 aria-hidden /> Remove item</Button></div></div>)}<Button type="button" className="mt-3" variant="outline" onClick={() => setItems((current) => { const kind = sectionKind(section, data.items); return [...current, { id: crypto.randomUUID(), studentCourseId: data.course.id, sectionId: section.id, title: "", stage: 1, ...(kind === "piece" ? {} : { kind, score: 0 as const }), updatedAt: new Date().toISOString() }]; })}><Plus aria-hidden /> Add item</Button></div>)}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={save.isPending}>Save course</Button><Button type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>Cancel</Button></div>
  </form></DialogContent></Dialog>;
}