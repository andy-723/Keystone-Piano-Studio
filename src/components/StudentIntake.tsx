import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useParentLanguage } from "@/i18n/parent";
import { intakeCopy } from "@/i18n/intake";
import { parentIntakesQuery } from "@/lib/onboarding-queries";
import { submitParentIntake } from "@/services/onboarding";
import { students } from "@/mocks/data";
import type { Intake, Lang } from "@/mocks/types";
import { IntakeTermsFlow } from "@/components/terms/IntakeTermsFlow";

export const intakeField = "mt-2 min-h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-lg md:text-lg";

export function IntakeForm({
  lang,
  initial,
  onSubmit,
  pending,
  error,
}: {
  lang: Lang;
  initial?: Intake | null;
  onSubmit: (intake: Intake) => void;
  pending: boolean;
  error?: string | undefined;
}) {
  const t = intakeCopy[lang];
  const [form, setForm] = useState<Intake>(
    initial ?? {
      experience: "beginner",
      previousGrades: "",
      theoryExams: "",
      instrument: "digital",
      goal: "",
      daysPerWeek: 5,
      minutesPerDay: 15,
      healthNotes: "",
    },
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
      className="mt-5 space-y-5"
    >
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <label className="block font-semibold">
          {t.experience}
          <select
            className={intakeField}
            value={form.experience}
            onChange={(event) => setForm({ ...form, experience: event.target.value === "beginner" ? "beginner" : "transferring" })}
          >
            <option value="beginner">{t.beginner}</option>
            <option value="transferring">{t.transferring}</option>
          </select>
        </label>
        {form.experience === "transferring" &&
          ([["previousGrades", t.previous], ["theoryExams", t.theory]] as const).map(([key, label]) => (
            <label key={key} className="block font-semibold">
              {label}
              <Input className={intakeField} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
            </label>
          ))}
        <label className="block font-semibold">
          {t.instrument}
          <select
            className={intakeField}
            value={form.instrument}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "acoustic" || value === "digital" || value === "keyboard") setForm({ ...form, instrument: value });
            }}
          >
            <option value="acoustic">{t.acoustic}</option>
            <option value="digital">{t.digital}</option>
            <option value="keyboard">{t.keyboard}</option>
          </select>
        </label>
        <label className="block font-semibold">
          {t.goal}
          <Input
            required
            className={intakeField}
            value={form.goal}
            placeholder={lang === "en" ? "Exam board or non-exam goal" : "考试委员会或非考试目标"}
            onChange={(event) => setForm({ ...form, goal: event.target.value })}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block font-semibold">
            {t.days}
            <Input
              className={intakeField}
              type="number"
              min={1}
              max={7}
              value={form.daysPerWeek}
              onChange={(event) => setForm({ ...form, daysPerWeek: Number(event.target.value) })}
            />
          </label>
          <label className="block font-semibold">
            {t.minutes}
            <Input
              className={intakeField}
              type="number"
              min={1}
              max={240}
              value={form.minutesPerDay}
              onChange={(event) => setForm({ ...form, minutesPerDay: Number(event.target.value) })}
            />
          </label>
        </div>
        <label className="block font-semibold">
          {lang === "zh-CN" ? "健康或学习备注（可选）" : "Health or learning notes (optional)"}
          <textarea
            className={intakeField}
            rows={3}
            value={form.healthNotes ?? ""}
            onChange={(event) => setForm({ ...form, healthNotes: event.target.value })}
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button disabled={pending} type="submit" className="w-full">
        {lang === "zh-CN" ? "继续到条款" : "Continue to terms"}
      </Button>
    </form>
  );
}

export function ParentIntakes({ recordId }: { recordId?: string } = {}) {
  const { data } = useSuspenseQuery(parentIntakesQuery);
  const { lang } = useParentLanguage();
  const t = intakeCopy[lang];
  const client = useQueryClient();
  const [pendingIntake, setPendingIntake] = useState<Record<string, Intake>>({});
  const [termsReady, setTermsReady] = useState<Record<string, boolean>>({});
  const submit = useMutation({
    mutationFn: ({ id, intake }: { id: string; intake: Intake }) => submitParentIntake(id, intake),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["parent"] }),
        client.invalidateQueries({ queryKey: ["enrolments"] }),
        client.invalidateQueries({ queryKey: ["chat-threads"] }),
      ]),
  });

  return (
    <>
      {data
        .filter((entry) => !recordId || entry.id === recordId)
        .map((entry) => {
          const student = students.find((item) => item.id === entry.studentId);
          const waitingTerms = Boolean(pendingIntake[entry.id]) && !termsReady[entry.id];
          return (
            <section key={entry.id} id={`intake-${entry.id}`} className="mt-6 border-y border-border py-6">
              <h2 className="text-2xl font-semibold">
                {t.heading} · {entry.studentName}
              </h2>
              {entry.status === "intake_sent" ? (
                waitingTerms && student ? (
                  <IntakeTermsFlow
                    lang={lang}
                    studentIds={[student.id]}
                    studentName={student.firstName}
                    birthYear={student.birthYear}
                    {...(pendingIntake[entry.id]?.healthNotes ? { healthNotes: pendingIntake[entry.id]!.healthNotes } : {})}
                    onComplete={() => {
                      setTermsReady((current) => ({ ...current, [entry.id]: true }));
                      const intake = pendingIntake[entry.id];
                      if (intake) submit.mutate({ id: entry.id, intake });
                    }}
                  />
                ) : (
                  <IntakeForm
                    lang={lang}
                    initial={entry.intake}
                    pending={submit.isPending}
                    error={submit.error?.message}
                    onSubmit={(intake) => setPendingIntake((current) => ({ ...current, [entry.id]: intake }))}
                  />
                )
              ) : (
                <p className="mt-3 text-success">{entry.status === "active" ? t.active : t.done}</p>
              )}
              {entry.status === "active" && (
                <div className="mt-5">
                  <h3 className="text-xl font-semibold">{t.assignment}</h3>
                  <p className="mt-2 whitespace-pre-wrap">{entry.assignment?.body}</p>
                  <p className="mt-2">
                    {t.practice}: {entry.practiceGoal} {lang === "en" ? "min/week" : "分钟/周"}
                  </p>
                </div>
              )}
            </section>
          );
        })}
    </>
  );
}
