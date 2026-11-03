import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, FileSpreadsheet, Search, Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentLimitBanner } from "@/components/PlanBilling";
import { StudentRiskBadge } from "@/components/StudentRiskBadge";
import { StudentCheckIn } from "@/components/StudentCheckIn";
import { studentsQuery } from "@/lib/student-queries";
import { filterStudents } from "@/lib/student-insights";

export const Route = createFileRoute("/students/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(studentsQuery),
  head: () => ({ meta: [{ title: "Student roster — Opus" }, { name: "description", content: "Student grade goals, attention flags and friendly family check-ins at Clarke Piano Studio." }, { property: "og:title", content: "Student roster — Opus" }, { property: "og:description", content: "Student grade goals, attention flags and friendly family check-ins at Clarke Piano Studio." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  errorComponent: () => <p role="alert">Students could not be opened. Please refresh to try again.</p>,
  component: Students,
});

function Students() {
  const { data } = useSuspenseQuery(studentsQuery);
  const [search, setSearch] = useState("");
  const [attention, setAttention] = useState(false);
  const shown = filterStudents(data, search, attention);
  const counts = { red: data.filter((student) => student.risk.band === "red").length, yellow: data.filter((student) => student.risk.band === "yellow").length };
  return <div className="mx-auto max-w-6xl">
    <header><Button asChild className="mb-5 mr-3"><Link to="/students/enrol"><UserPlus aria-hidden />Enrol student</Link></Button><Button asChild variant="outline" className="mb-5"><Link to="/students/import"><FileSpreadsheet aria-hidden />Import students</Link></Button><h1 className="flex items-center gap-3 text-3xl font-semibold"><Users className="size-7 text-primary" aria-hidden /> Students</h1><p className="mt-2 text-muted-foreground">{data.length} students · {counts.red} red · {counts.yellow} yellow</p></header><StudentLimitBanner activeStudents={data.length}/>
    <div className="my-7 flex flex-wrap items-center gap-4 border-y border-border py-5">
      <label className="relative min-w-0 flex-1 basis-72"><span className="sr-only">Search students</span><Search className="absolute left-3 top-4 size-5 text-muted-foreground" aria-hidden /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students or families" className="min-h-12 w-full rounded-md border border-input bg-card py-3 pl-11 pr-3 text-base" /></label>
      <div role="group" aria-label="Student filter" className="flex flex-wrap gap-2"><Button variant={attention ? "ghost" : "secondary"} aria-pressed={!attention} onClick={() => setAttention(false)}>All students</Button><Button variant={attention ? "secondary" : "ghost"} aria-pressed={attention} onClick={() => setAttention(true)}>Needs attention</Button></div>
    </div>
    <p className="mb-4 text-base text-muted-foreground" aria-live="polite">{shown.length} {shown.length === 1 ? "student" : "students"}{attention ? " needing attention" : ""}</p>
    <div className="space-y-4">{shown.map((student) => <article key={student.id} aria-label={`${student.firstName} ${student.lastName}`} className="rounded-md border border-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-2xl font-semibold">{student.firstName} {student.lastName}</h2><p className="mt-1 text-base text-muted-foreground">{student.gradeGoal} · {student.familyName}</p></div><StudentRiskBadge band={student.risk.band} /></div>
      {student.risk.band !== "green" && <ul className="mt-4 space-y-1 border-l-2 border-border pl-4 text-base">{student.risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      <div className="mt-5 flex flex-wrap items-center gap-3">{student.risk.band === "red" && <StudentCheckIn studentId={student.id} />}<Button asChild variant="ghost" className="ml-auto"><Link to="/students/$studentId" params={{ studentId: student.id }}>Open profile <ArrowRight aria-hidden /></Link></Button></div>
    </article>)}</div>
    {shown.length === 0 && <p className="border-t border-border py-10 text-muted-foreground">No students match this search.</p>}
  </div>;
}