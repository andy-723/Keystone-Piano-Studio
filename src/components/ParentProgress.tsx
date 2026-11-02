import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ProgressRing";
import { parentProgressQuery } from "@/lib/parent-queries";
import { readiness, weekPractice } from "@/lib/lesson-progress";
import { PROTOTYPE_TODAY } from "@/lib/calendar";
import { useParentLanguage, parentGrade, parentRequirement } from "@/i18n/parent";
import { logParentPractice } from "@/services/parent";

export function ParentProgress() {
  const { data } = useSuspenseQuery(parentProgressQuery);
  const { t, lang } = useParentLanguage();
  return <div><h1 className="text-3xl font-semibold">{t("progress")}</h1>{data.map((child) => <ChildProgress key={child.student.id} child={child} />)}</div>;
}
function ChildProgress({ child }: { child: Awaited<ReturnType<typeof import("@/services/parent").getParentProgress>>[number] }) {
  const { t, lang } = useParentLanguage();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("15");
  const [date, setDate] = useState(PROTOTYPE_TODAY);
  const client = useQueryClient();
  const saving = useMutation({ mutationFn: () => logParentPractice({ studentId: child.student.id, date, minutes: Number(minutes) }), onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["parent", "progress"] }), client.invalidateQueries({ queryKey: ["live-lesson"] })]); setOpen(false); toast.success(t("practiceSaved")); }, onError: () => toast.error(t("practiceError")) });
  const practice = weekPractice(child.practice, PROTOTYPE_TODAY);
  return <section className="mt-6 border-t border-border py-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-semibold">{child.student.firstName} {child.student.lastName}</h2><p className="mt-2">{parentGrade(child.gradeGoal, lang)}</p></div><ProgressRing percent={readiness(child.requirements, child.progress)} readyLabel={t("ready")} ariaLabel={t("readiness")} /></div>
    <div className="my-5 border-y border-border py-5"><h3 className="text-xl font-semibold">{t("practiceWeek")}</h3><p className="mt-3 text-lg"><strong>{practice.student} {t("minutes")}</strong> · {t("studentMinutes")}</p><p className="mt-2 text-base text-muted-foreground">{practice.teacher} {t("minutes")} · {t("teacherMinutes")}</p><Button className="mt-4 w-full" onClick={() => setOpen(!open)}><Plus aria-hidden />{t("logPractice")}</Button>
      {open && <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); saving.mutate(); }}><label className="block text-base">{t("minutes")}<input type="number" min="1" step="1" required inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="mt-2 min-h-12 w-full rounded-md border-2 border-input bg-card p-3 text-lg" /></label><label className="block text-base">{t("date")}<input type="date" required max={PROTOTYPE_TODAY} value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 min-h-12 w-full min-w-0 rounded-md border-2 border-input bg-card p-3 text-base" /></label><div className="flex flex-wrap gap-3"><Button type="submit" disabled={saving.isPending} variant="secondary">{t("save")}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button></div></form>}
    </div><h3 classNameName="text-xl font-semibold">{t("requirements")}</h3>{(["scales", "pieces", "aural", "sight-reading"] as const).map((category) => <div key={category} className="mt-5"><h4 className="text-lg font-semibold text-primary">{t(category)}</h4>{child.requirements.filter((requirement) => requirement.category === category).map((requirement) => { const status = child.progress.find((entry) => entry.requirementId === requirement.id)?.status ?? "not_started"; return <div key={requirement.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3"><p className="text-base">{parentRequirement(requirement.title, lang)}</p><span className={`text-base ${status === "passed" ? "text-success" : "text-muted-foreground"}`}>{t(status)}</span></div>; })}</div>)}
  </section>;
}