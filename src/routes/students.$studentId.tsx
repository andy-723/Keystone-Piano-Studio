import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planBillingQuery } from "@/lib/plan-queries";
import { StudentRiskBadge } from "@/components/StudentRiskBadge";
import { StudentCheckIn } from "@/components/StudentCheckIn";
import { StudentCourse } from "@/components/StudentCourse";
import { studentProfileQuery } from "@/lib/student-queries";
import { formatAUD, formatNumericDate, formatShortDate, formatTime } from "@/lib/format";
import { LessonScheduling } from "@/components/LessonScheduling";
import { ProfilePicture } from "@/components/ProfilePicture";
import { INVOICE_STATUS } from "@/lib/billing-queries";

export const Route = createFileRoute("/students/$studentId")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.fetchQuery(studentProfileQuery(params.studentId));
    if (!data) throw notFound();
    return { name: `${data.student.firstName} ${data.student.lastName}` };
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.name ?? "Student profile"} — Keystone Music HQ` }, { name: "description", content: "Student details, family contacts, attendance, four-week practice, progress and invoices." }, { property: "og:title", content: `${loaderData?.name ?? "Student profile"} — Keystone Music HQ` }, { property: "og:description", content: "Student details, family contacts, attendance, four-week practice, progress and invoices." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  notFoundComponent: () => <p>Student not found.</p>,
  errorComponent: () => <p role="alert">This student profile could not be opened. Please refresh to try again.</p>,
  component: StudentProfile,
});

const attendanceLabels = { scheduled: "Not marked", attended: "Attended", absent: "Absent", cancelled_by_studio: "Cancelled by studio", cancelled_late: "Late cancel" };

function StudentProfile() {
  const { studentId } = Route.useParams();
  const { data } = useSuspenseQuery(studentProfileQuery(studentId));
  const { data: subscription } = useSuspenseQuery(planBillingQuery());
  const pro = subscription.plan !== "base";
  if (!data) return null;
  const { student, family } = data;
  const maxMinutes = Math.max(data.course.course.weeklyPracticeGoalMin, 1, ...data.practice.map((week) => week.studentMinutes + week.teacherMinutes));
  const totalMinutes = data.practice.reduce((sum, week) => sum + week.studentMinutes + week.teacherMinutes, 0);
  return <div className="mx-auto max-w-5xl">
    <Button asChild variant="ghost" className="mb-5"><Link to="/students"><ArrowLeft aria-hidden /> All students</Link></Button>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-4"><ProfilePicture id={student.id} name={`${student.firstName} ${student.lastName}`} editable/></div><h1 className="break-words text-3xl font-semibold">{student.firstName} {student.lastName}</h1><p className="mt-2 text-lg text-muted-foreground">{student.gradeGoal}</p></div><StudentRiskBadge band={student.risk.band} /></header>
    {student.risk.band !== "green" && (pro || student.risk.band !== "red") && <section aria-label="Needs attention" className="mt-6 border-l-4 border-warning pl-5"><h2 className="text-xl font-semibold">Needs attention</h2><ul className="my-3 space-y-1">{student.risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>{pro && student.risk.band === "red" && <StudentCheckIn studentId={student.id} />}</section>}
    <section className="mt-8 border-t border-border py-7" aria-labelledby="student-details"><h2 id="student-details" className="text-2xl font-semibold">Details & family</h2>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2"><div><dt className="text-base text-muted-foreground">Birth year</dt><dd className="mt-1">{student.birthYear}</dd></div><div><dt className="text-base text-muted-foreground">Family</dt><dd className="mt-1">{family?.displayName ?? "Not recorded"}</dd></div><div><dt className="text-base text-muted-foreground">Exam goal</dt><dd className="mt-1">{student.examDate ? formatNumericDate(student.examDate) : student.targetTerm}</dd></div></dl>
      <h3 className="mt-6 text-xl font-semibold">Guardians</h3><div className="mt-3 space-y-4">{family?.guardians.map((guardian) => <div key={guardian.id}><p className="font-semibold">{guardian.name}</p><p className="break-all text-base text-muted-foreground">{guardian.email}</p>{guardian.mobile && <p className="text-base text-muted-foreground">{guardian.mobile}</p>}<p className="text-base text-muted-foreground">Preferred language: {guardian.preferredLanguage === "zh-CN" ? "中文" : "English"}</p></div>)}</div>
    </section>
    <section className="border-t border-border py-7"><h2 className="text-2xl font-semibold">Make-up lessons · {data.credits.balance} owed</h2><LessonScheduling student={{ id: student.id, name: `${student.firstName} ${student.lastName}`, durationMin: student.durationMin }} movable={false} balance={data.credits.balance} history /></section>
    <section className="border-t border-border py-7" aria-labelledby="attendance-history"><h2 id="attendance-history" className="text-2xl font-semibold">Attendance history</h2><p className="mt-2 text-base text-muted-foreground">Term 1 to date · {data.attendance.filter((lesson) => lesson.status === "attended").length} attended of {data.attendance.length} lessons</p>
      <div className="mt-4 divide-y divide-border">{data.attendance.map((lesson) => <div key={lesson.id} className="flex flex-wrap justify-between gap-3 py-4"><div><p>{formatShortDate(lesson.date)} · {formatTime(lesson.startsAt)}</p><p className="text-base text-muted-foreground">{lesson.lessonType.name}</p></div><span className={`text-base font-semibold ${lesson.status === "absent" || lesson.status === "cancelled_late" ? "text-destructive" : lesson.status === "attended" ? "text-success" : "text-muted-foreground"}`}>{attendanceLabels[lesson.status]}</span></div>)}</div>{!data.attendance.length && <p className="mt-4 text-muted-foreground">No lessons in this period.</p>}
    </section>
    <section className="border-t border-border py-7" aria-labelledby="practice-history"><h2 id="practice-history" className="text-2xl font-semibold">Weekly goal vs actual</h2><p className="mt-2 text-base text-muted-foreground">{totalMinutes} minutes total · Weekly goal {data.course.course.weeklyPracticeGoalMin} min</p>
      <div className="my-4 flex flex-wrap gap-5 text-base"><span className="inline-flex items-center gap-2"><span className="size-3 bg-success" aria-hidden /> At home</span><span className="inline-flex items-center gap-2"><span className="size-3 bg-primary" aria-hidden /> In lessons</span></div>
      <svg viewBox="0 0 560 160" className="h-40 w-full" role="img" aria-label="Practice minutes across four weeks, with exact totals below">
        <line x1="0" x2="560" y1="150" y2="150" className="stroke-border" /><line x1="0" x2="560" y1={150 - data.course.course.weeklyPracticeGoalMin / maxMinutes * 130} y2={150 - data.course.course.weeklyPracticeGoalMin / maxMinutes * 130} strokeDasharray="6 4" className="stroke-warning" />
        {data.practice.map((week, index) => <g key={week.start}><rect x={index * 140 + 35} y={150 - (week.studentMinutes + week.teacherMinutes) / maxMinutes * 130} width="70" height={week.studentMinutes / maxMinutes * 130} className="fill-success" /><rect x={index * 140 + 35} y={150 - week.teacherMinutes / maxMinutes * 130} width="70" height={week.teacherMinutes / maxMinutes * 130} className="fill-primary" /></g>)}
      </svg>
      <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">{data.practice.map((week) => <div key={week.start}><p className="text-base">{formatShortDate(week.start)} – {formatShortDate(week.end)}</p><p className="mt-1 font-semibold">{week.studentMinutes + week.teacherMinutes} min</p><p className="text-base text-muted-foreground">At home {week.studentMinutes} · In lessons {week.teacherMinutes}</p></div>)}</div>
    </section>
    <StudentCourse data={data.course} />
    <section className="border-t border-border py-7" aria-labelledby="student-invoices"><h2 id="student-invoices" className="text-2xl font-semibold">Family invoices</h2><p className="mt-2 text-base text-muted-foreground">{family?.displayName}</p><div className="mt-4 divide-y divide-border">{data.invoices.map((invoice) => <Button key={invoice.id} asChild variant="ghost" className="h-auto w-full justify-start whitespace-normal rounded-none px-0 py-4 text-left"><Link to="/invoices/$invoiceId" params={{ invoiceId: invoice.id }}><div className="min-w-0 flex-1"><p className="break-all">{invoice.number}</p><p className="mt-1 text-base font-normal text-muted-foreground">Due {formatNumericDate(invoice.dueDate)} · {INVOICE_STATUS[invoice.status]}</p></div><span className="shrink-0">{formatAUD(invoice.totalCents)}</span><ArrowRight className="shrink-0" aria-hidden /></Link></Button>)}</div>{!data.invoices.length && <p className="mt-4 text-muted-foreground">No invoices for this family.</p>}</section>
  </div>;
}