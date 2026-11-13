import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, FileSpreadsheet, Search, Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentLimitBanner } from "@/components/PlanBilling";
import { planBillingQuery } from "@/lib/plan-queries";
import { StudentRiskBadge } from "@/components/StudentRiskBadge";
import { StudentCheckIn } from "@/components/StudentCheckIn";
import { rosterProgressQuery, studentsQuery } from "@/lib/student-queries";
import { BENCHMARK_LEVELS } from "@/lib/benchmarks";
import { termLabel } from "@/lib/course-progress";
import { formatNumericDate } from "@/lib/format";
import { ProfilePicture } from "@/components/ProfilePicture";
import { filterStudents } from "@/lib/student-insights";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteExampleStudent } from "@/services/students";

export const Route = createFileRoute("/students/")({
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(studentsQuery), context.queryClient.ensureQueryData(rosterProgressQuery)]),
  head: () => ({ meta: [{ title: "Student roster — Keystone Music HQ" }, { name: "description", content: "Student grade goals, attention flags and friendly family check-ins at Keystone Music HQ." }, { property: "og:title", content: "Student roster — Keystone Music HQ" }, { property: "og:description", content: "Student grade goals, attention flags and friendly family check-ins at Keystone Music HQ." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  errorComponent: () => <p role="alert">Students could not be opened. Please refresh to try again.</p>,
  component: Students,
});

function Students() {
  const { data } = useSuspenseQuery(studentsQuery);
  const { data: subscription } = useSuspenseQuery(planBillingQuery());
  const pro = subscription.plan !== "base";
  const [search, setSearch] = useState("");
  const [attention, setAttention] = useState(false);
  const [level, setLevel] = useState("all");
  const { data: progress } = useSuspenseQuery(rosterProgressQuery);
  const progressFor = (id: string) => progress.find((row) => row.studentId === id);
  const shown = filterStudents(data, search, attention).filter(student => !attention || pro || student.risk.band !== "red").filter((student) => level === "all" || (level === "other" ? !progressFor(student.id)?.benchmarkLevel : progressFor(student.id)?.benchmarkLevel === level));
  const counts = { red: data.filter((student) => student.risk.band === "red").length, yellow: data.filter((student) => student.risk.band === "yellow").length };
  return <div className="mx-auto max-w-6xl">
    <header><Button asChild className="mb-5 mr-3" data-tour="enrol-student"><Link to="/students/enrol"><UserPlus aria-hidden />Enrol student</Link></Button><Button asChild variant="outline" className="mb-5 mr-3"><Link to="/students/import"><FileSpreadsheet aria-hidden />Import students</Link></Button><Button asChild variant="outline" className="mb-5" data-tour="student-groups"><Link to="/students/groups"><Users aria-hidden />Groups</Link></Button><h1 className="flex items-center gap-3 text-3xl font-semibold"><Users className="size-7 text-primary" aria-hidden /> Students</h1><p className="mt-2 text-muted-foreground">{data.length} students{pro && ` · ${counts.red} red`} · {counts.yellow} yellow</p></header><StudentLimitBanner activeStudents={data.length}/>
    <div className="my-7 flex flex-wrap items-center gap-4 border-y border-border py-5">
      <label className="relative min-w-0 flex-1 basis-72"><span className="sr-only">Search students</span><Search className="absolute left-3 top-4 size-5 text-muted-foreground" aria-hidden /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students or families" className="min-h-12 w-full rounded-md border border-input bg-card py-3 pl-11 pr-3 text-base" /></label>
      <div role="group" aria-label="Student filter" className="flex flex-wrap gap-2"><Button variant={attention ? "ghost" : "secondary"} aria-pressed={!attention} onClick={() => setAttention(false)}>All students</Button><Button variant={attention ? "secondary" : "ghost"} aria-pressed={attention} onClick={() => setAttention(true)}>Needs attention</Button></div>
      <label className="text-base">Level<select aria-label="Filter by level" className="ml-2 min-h-12 rounded-md border border-input bg-card p-2" value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">All levels</option>{BENCHMARK_LEVELS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} ({progress.filter((row) => row.benchmarkLevel === entry.id).length})</option>)}<option value="other">Other courses</option></select></label>
    </div>
    <p className="mb-4 text-base text-muted-foreground" aria-live="polite">{shown.length} {shown.length === 1 ? "student" : "students"}{attention ? " needing attention" : ""}</p>
    <div className="space-y-4">{shown.map((student) => <article key={student.id} aria-label={`${student.firstName} ${student.lastName}`} className="rounded-md border border-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="mb-3"><ProfilePicture id={student.id} name={`${student.firstName} ${student.lastName}`}/></div><h2 className="break-words text-2xl font-semibold">{student.firstName} {student.lastName}</h2><p className="mt-1 text-base text-muted-foreground">{student.gradeGoal} · {student.familyName}</p><CourseLine row={progressFor(student.id)} />{student.isExample && <ExampleStudentNote id={student.id} name={student.firstName} />}</div><StudentRiskBadge band={student.risk.band} /></div>
      {student.risk.band !== "green" && (pro || student.risk.band !== "red") && <ul className="mt-4 space-y-1 border-l-2 border-border pl-4 text-base">{student.risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      <div className="mt-5 flex flex-wrap items-center gap-3">{pro && student.risk.band === "red" && <StudentCheckIn studentId={student.id} />}<Button asChild variant="ghost" className="ml-auto"><Link to="/students/$studentId" params={{ studentId: student.id }}>Open profile <ArrowRight aria-hidden /></Link></Button></div>
    </article>)}</div>
    {shown.length === 0 && <p className="border-t border-border py-10 text-muted-foreground">No students match this search.</p>}
  </div>;
}
/** Level, readiness, goal term and last sign-off from the student's current course. */
function CourseLine({ row }: { row: { level: string; readiness: number; targetTerm: string; lastSignOffAt?: string } | undefined }) {
  if (!row) return null;
  return <p className="mt-1 text-base" aria-label="Course progress"><span className="font-semibold">{row.level}</span> · {row.readiness}% ready · Goal {termLabel(row.targetTerm)} · {row.lastSignOffAt ? `Last sign-off ${formatNumericDate(row.lastSignOffAt.slice(0, 10))}` : "No sign-offs yet"}</p>;
}
/** The example a new studio starts with: say so, and let the owner delete it. */
function ExampleStudentNote({ id, name }: { id: string; name: string }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteExampleStudent(id),
    onSuccess: async () => {
      toast.success("Example student deleted");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't delete the example."),
  });
  return <div className="mt-3 rounded-md border-l-4 border-border bg-muted/40 p-3 text-base">
    <p><strong>Example student.</strong> {name} shows you how a student looks in Keystone. Families are never invited from this example.</p>
    <Button type="button" variant="outline" className="mt-3" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete the example student ${name} and the example family?`)) remove.mutate(); }}>{remove.isPending ? "Deleting…" : "Delete example"}</Button>
  </div>;
}
