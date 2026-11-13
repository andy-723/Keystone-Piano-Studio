import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useParentLanguage } from "@/i18n/parent";

import { weekPractice } from "@/lib/lesson-progress";
import { logParentPractice } from "@/services/parent";
import type { PracticeLog } from "@/mocks/types";
import { studioToday } from "@/lib/studio-clock";

export function ParentPractice({ studentId, logs }: { studentId: string; logs: PracticeLog[] }) {
  const { t } = useParentLanguage(); const client = useQueryClient();
  const [open, setOpen] = useState(false); const [minutes, setMinutes] = useState("15"); const [date, setDate] = useState(studioToday());
  const practice = weekPractice(logs, studioToday());
  const saving = useMutation({ mutationFn: () => logParentPractice({ studentId, minutes: Number(minutes), date }), onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["parent", "progress"] }), client.invalidateQueries({ queryKey: ["live-lesson"] }), client.invalidateQueries({ queryKey: ["student-profile"] })]); setOpen(false); toast.success(t("practiceSaved")); }, onError: () => toast.error(t("practiceError")) });
  return <section className="mt-6 border-t border-border py-5" aria-label={t("practiceWeek")}><h3 className="text-xl font-semibold">{t("practiceWeek")}</h3><p className="mt-3">{practice.student} {t("minutes")} · {t("studentMinutes")}</p><p className="mt-2 text-base text-muted-foreground">{practice.teacher} {t("minutes")} · {t("teacherMinutes")}</p><Button className="mt-4 w-full" onClick={() => setOpen(!open)}><Plus aria-hidden />{t("logPractice")}</Button>{open && <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); saving.mutate(); }}><label className="block text-base">{t("minutes")}<Input className="mt-2 min-h-12" type="number" min="1" step="1" required value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label><label className="block text-base">{t("date")}<Input className="mt-2 min-h-12" type="date" required max={studioToday()} value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="flex flex-wrap gap-3"><Button type="submit" disabled={saving.isPending}>{t("save")}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button></div></form>}</section>;
}