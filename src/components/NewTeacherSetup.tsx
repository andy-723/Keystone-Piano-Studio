import { GST_ON_LESSONS } from "@/lib/tax-copy";
import { Suspense, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EnrolStudent } from "@/components/EnrolStudent";
import { Library } from "@/components/Library";
import { Integrations } from "@/components/Integrations";
import { BillingSettings } from "@/components/BillingSettings";
import { ImportStudents } from "@/components/ImportStudents";
import { NewStudioStudents } from "@/components/NewStudioStudents";
import { StudioTermsOnboarding } from "@/components/StudioTermsOnboarding";
import { StudioTermsSettings } from "@/components/StudioTermsSettings";
import { BrandLogo } from "@/components/BrandLogo";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen, Check, Clock, FileSpreadsheet, Landmark, ListChecks, Plus, Send, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { setupQuery } from "@/lib/setup-queries";
import { formatShortDate } from "@/lib/format";

import { STUDIO_STATES, type SetupStep, type SetupSession } from "@/mocks/setup";
import { completeSetup, resumeSetup, saveSetupStep, type SetupStepInput } from "@/services/setup";
import { getStudioTermsDraft } from "@/services/terms";
import { getBillingProfile } from "@/services/billing-profile";
import type { Studio } from "@/mocks/types";
import { studioToday } from "@/lib/studio-clock";
import { useSiteLang } from "@/i18n/marketing/site-lang";
import { tSetup } from "@/i18n/setup-wizard";

const fieldClass = "mt-2 h-14 min-h-14 text-lg md:text-lg";
const SETUP_TITLES = [
  "Tell us about your studio",
  "Are you registered for GST?",
  "Your lessons and prices",
  "Your cancellation policies",
  "How would you like to add students?",
] as const;

export function NewTeacherSetup({ shellStudio }: { shellStudio: Studio }) {
  const { data } = useSuspenseQuery(setupQuery);
  const termsDraft = useQuery({ queryKey: ["terms-draft", "new-studio"], queryFn: () => getStudioTermsDraft("new-studio"), enabled: data.completed || data.paused });
  const [enrolling, setEnrolling] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [payToOpen, setPayToOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["new-studio"] });
  const resume = useMutation({ mutationFn: (step: SetupStep) => resumeSetup(step), onSuccess: refresh });
  const billingProfile = useQuery({
    queryKey: ["billing-profile", "new-studio"],
    queryFn: () => getBillingProfile("new-studio"),
    enabled: data.paused || data.completed,
  });
  const hasPayTo = Boolean(
    billingProfile.data?.payTo.bsb && billingProfile.data?.payTo.accountNumber,
  );

  // Focus-mode onboarding (no app shell), matching family /join.
  if (data.completed && termsDraft.data?.needsOnboarding) {
    return (
      <StudioTermsOnboarding
        scope="new-studio"
        onComplete={() => {
          void client.invalidateQueries({ queryKey: ["terms-draft", "new-studio"] });
          setTermsOpen(true);
        }}
      />
    );
  }

  const body = (() => {
  if (enrolling) return <Suspense fallback={<p>Opening enrolment…</p>}><EnrolStudent scope="new-studio" onClose={()=>setEnrolling(false)}/></Suspense>;
  if (libraryOpen) return <><Button variant="ghost" onClick={()=>setLibraryOpen(false)}><ArrowLeft aria-hidden/>Back to your studio</Button><Suspense fallback={<p>Opening library…</p>}><Library scope="new-studio"/></Suspense></>;
  if (paymentsOpen) return <div className="mx-auto max-w-3xl"><Button variant="ghost" onClick={() => setPaymentsOpen(false)}><ArrowLeft aria-hidden />Back to your studio</Button><Suspense fallback={<p>Opening payments…</p>}><Integrations scope="new-studio" studioName={data.studio.name} stripeOnly /></Suspense></div>;
  if (payToOpen) return <div className="mx-auto max-w-3xl"><Button variant="ghost" onClick={() => setPayToOpen(false)}><ArrowLeft aria-hidden />Back to your studio</Button><Suspense fallback={<p>Opening payment details…</p>}><BillingSettings scope="new-studio" /></Suspense></div>;
  if (importing) return <Suspense fallback={<p>Opening student import…</p>}><ImportStudents scope="new-studio" onClose={() => setImporting(false)} /></Suspense>;
  if (termsOpen) {
    return (
      <div>
        <Button variant="ghost" onClick={() => setTermsOpen(false)}><ArrowLeft aria-hidden />Back to your studio</Button>
        <StudioTermsSettings scope="new-studio" />
      </div>
    );
  }
  if (data.paused || data.completed) return <div className="mx-auto max-w-3xl"><p className="text-base text-muted-foreground">{data.studio.teacherName ? `Hello, ${data.studio.teacherName}` : "Your new studio"}</p><h1 className="mt-3 text-3xl font-semibold">{formatShortDate(studioToday())}</h1><div className="my-6 border-y border-border py-6"><p className="flex items-center gap-3 text-xl"><BookOpen aria-hidden />{data.lessonCount ? `${data.lessonCount} weekly lesson times saved` : "No lessons yet"}</p></div><section className="rounded-md border border-border bg-card p-5 md:p-7" aria-label="Studio checklist"><h2 className="flex items-center gap-3 text-2xl font-semibold"><ListChecks aria-hidden />A fresh start</h2>{!data.completed && <Button className="mt-5 w-full whitespace-normal" disabled={resume.isPending} onClick={() => resume.mutate(data.step)}>Continue setup · Step {data.step} of 5 <ArrowRight aria-hidden /></Button>}<div className="mt-5 divide-y divide-border">{[{ title: "Add students", icon: UserPlus, step: 5 as const }, { title: "Set lesson times", icon: Clock }, { title: "Add your payment details", icon: Landmark, action: "payTo" as const }, { title: "Connect payments", icon: Check, action: "stripe" as const }, { title: "Invite families", icon: Send }].map(({ title, icon: Icon, step, action }) => <div key={title} className="flex flex-wrap items-center justify-between gap-3 py-4"><span className="flex items-center gap-3 text-lg"><Icon aria-hidden className="size-5" />{title}</span>{step ? <Button variant="outline" onClick={() => setImporting(true)} disabled={resume.isPending}>Import students <ArrowRight aria-hidden /></Button> : action === "payTo" ? <Button variant="outline" onClick={() => setPayToOpen(true)}>{hasPayTo ? "Review payment details" : "Add payment details"} <ArrowRight aria-hidden /></Button> : action === "stripe" ? <Button variant="outline" onClick={() => setPaymentsOpen(true)}>Connect payments <ArrowRight aria-hidden /></Button> : <span className="text-base text-muted-foreground">{data.studentCount ? title === "Set lesson times" ? "Saved from import" : "See family chat below" : "Add students first"}</span>}</div>)}</div>{!hasPayTo && <p className="mt-4 border-l-4 border-warning bg-warning-soft p-3 text-base">Add your payment details before you send your first invoice.</p>}{data.completed && <><Button className="mt-5 w-full" variant="outline" onClick={() => setTermsOpen(true)}>Studio terms &amp; publish <ArrowRight aria-hidden /></Button><Button variant="link" className="mt-3 min-h-12 px-0 text-base" onClick={() => resume.mutate(1)}>Review studio setup</Button></>}</section><Suspense fallback={<p>Opening students…</p>}><div className="mt-5 flex flex-wrap gap-3"><Button onClick={()=>setEnrolling(true)}><UserPlus aria-hidden/>Enrol student</Button><Button variant="outline" onClick={()=>setLibraryOpen(true)}><BookOpen aria-hidden/>Library</Button></div><NewStudioStudents onImport={() => setImporting(true)} /></Suspense><section className="mt-7 border-y border-border py-5"><h2 className="text-xl font-semibold">{data.studio.state} school terms · 2027</h2>{data.calendar.terms.map((term) => <p key={term.name} className="mt-3 text-base">{term.name} · {formatShortDate(term.start)} – {formatShortDate(term.end)}</p>)}{data.calendar.note && <p className="mt-3 text-base text-muted-foreground">{data.calendar.note}</p>}</section></div>;
  return <SetupWizard key={data.step} data={data} />;
  })();

  return <AppShell studio={shellStudio}>{body}</AppShell>;
}

function SetupWizard({ data }: { data: SetupSession }) {
  const lang = useSiteLang();
  const [form, setForm] = useState(data);
  const [error, setError] = useState("");
  const [studentNotice, setStudentNotice] = useState(false);
  const client = useQueryClient();
  const input = (): SetupStepInput => {
    switch (data.step) {
      case 1:
        return { step: 1, data: form.studio };
      case 2:
        return { step: 2, data: form.tax };
      case 3:
        return { step: 3, data: form.lessons };
      case 4:
        return { step: 4, data: form.policies };
      case 5:
        return { step: 5, data: form.students };
    }
  };
  const saving = useMutation({
    mutationFn: async ({ later = false, back = false }: { later?: boolean; back?: boolean }) => {
      const next = (back ? Math.max(1, data.step - 1) : Math.min(5, data.step + 1)) as SetupStep;
      await saveSetupStep(input(), { finishLater: later || back, nextStep: later ? data.step : next });
      if (back) await resumeSetup(next);
      else if (!later && data.step === 5) await completeSetup();
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["new-studio"] }),
    onError: (err: Error) => setError(err.message),
  });
  const changeStudio = (key: "name" | "teacherName" | "suburb", value: string) =>
    setForm({ ...form, studio: { ...form.studio, [key]: value } });
  const tx = (english: string, vars?: Record<string, string | number>) => tSetup(lang, english, vars);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-7">
        {data.step === 1 && (
          <div className="mb-6 flex justify-center">
            <BrandLogo variant="tagline" alt="Keystone Music HQ" />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg font-semibold text-muted-foreground">
            {tx("Step {n} of {total}", { n: data.step, total: 5 })}
          </p>
          <Button
            variant="link"
            className="min-h-12 px-0 text-base"
            disabled={saving.isPending}
            onClick={() => saving.mutate({ later: true })}
          >
            {tx("Finish later")}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2" aria-hidden>
          {SETUP_TITLES.map((title, index) => (
            <div key={title} className={`h-1.5 ${index < data.step ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>
        <h1 className="mt-6 text-3xl font-semibold">{tx(SETUP_TITLES[data.step - 1]!)}</h1>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          saving.mutate({});
        }}
        noValidate
      >
        <fieldset disabled={saving.isPending} className="min-w-0 space-y-6">
          {data.step === 1 && (
            <>
              {(
                [
                  ["name", "Studio name"],
                  ["teacherName", "Your name"],
                  ["suburb", "Suburb"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-lg font-semibold">
                  {tx(label)}
                  <Input
                    className={fieldClass}
                    value={form.studio[key]}
                    autoComplete={key === "teacherName" ? "name" : "off"}
                    onChange={(event) => changeStudio(key, event.target.value)}
                  />
                </label>
              ))}
              <label className="block text-lg font-semibold">
                {tx("State or territory")}
                <select
                  aria-label={tx("State or territory")}
                  className="mt-2 block min-h-14 w-full rounded-md border border-input bg-card px-3 text-lg"
                  value={form.studio.state}
                  onChange={(event) => {
                    const state = STUDIO_STATES.find((value) => value === event.target.value);
                    if (state) setForm({ ...form, studio: { ...form.studio, state } });
                  }}
                >
                  {STUDIO_STATES.map((state) => (
                    <option key={state}>{state}</option>
                  ))}
                </select>
              </label>
              <p className="border-l-4 border-border pl-4 text-base text-muted-foreground">
                {tx("Keystone Music HQ is currently available to studios in Australia")}
              </p>
            </>
          )}
          {data.step === 2 && (
            <>
              <p className="text-base text-muted-foreground">{GST_ON_LESSONS}</p>
              <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="GST registration">
                {(
                  [
                    ["yes", "Yes"],
                    ["no", "No"],
                    ["not_sure", "Not sure"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={form.tax.registration === value ? "default" : "outline"}
                    className="min-h-14 text-lg"
                    aria-pressed={form.tax.registration === value}
                    onClick={() => setForm({ ...form, tax: { ...form.tax, registration: value } })}
                  >
                    {tx(label)}
                  </Button>
                ))}
              </div>
              {form.tax.registration === "yes" && (
                <label className="block text-lg font-semibold">
                  {tx("ABN")}
                  <Input
                    inputMode="numeric"
                    className={fieldClass}
                    value={form.tax.abn}
                    placeholder="11 digits"
                    onChange={(event) => setForm({ ...form, tax: { ...form.tax, abn: event.target.value } })}
                  />
                </label>
              )}
              {form.tax.registration === "not_sure" && (
                <p className="border-l-4 border-border pl-4 text-lg">
                  You must register for GST within 21 days of your GST turnover reaching $75,000, counting
                  the past 12 months or what you expect over the next 12. Check with your tax agent. You
                  can change this later.
                </p>
              )}
            </>
          )}
          {data.step === 3 && (
            <>
              <p className="text-base text-muted-foreground">
                {form.tax.registration === "yes" ? tx("Prices include GST") : tx("Lesson prices (AUD)")}
              </p>
              <div className="divide-y divide-border">
                {form.lessons.map((row) => (
                  <div key={row.id} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="min-w-0 text-base font-semibold">
                      {tx("Minutes")}
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        className={fieldClass}
                        value={row.durationMin || ""}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            lessons: form.lessons.map((entry) =>
                              entry.id === row.id
                                ? { ...entry, durationMin: Number(event.target.value) }
                                : entry,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="min-w-0 text-base font-semibold">
                      {tx("Price (AUD)")}
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className={fieldClass}
                        value={Number.isFinite(row.priceCents) ? row.priceCents / 100 : ""}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            lessons: form.lessons.map((entry) =>
                              entry.id === row.id
                                ? { ...entry, priceCents: Math.round(Number(event.target.value) * 100) }
                                : entry,
                            ),
                          })
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      className="self-end"
                      aria-label={`Remove ${row.durationMin}-minute lesson`}
                      onClick={() =>
                        setForm({
                          ...form,
                          lessons: form.lessons.filter((entry) => entry.id !== row.id),
                        })
                      }
                    >
                      <Trash2 aria-hidden />
                      {tx("Remove")}
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setForm({
                    ...form,
                    lessons: [...form.lessons, { id: crypto.randomUUID(), durationMin: 0, priceCents: 0 }],
                  })
                }
              >
                <Plus aria-hidden />
                {tx("Add lesson price")}
              </Button>
            </>
          )}
          {data.step === 4 && (
            <>
              <fieldset>
                <legend className="mb-4 text-lg font-semibold">{tx("Late-cancellation notice")}</legend>
                <div className="flex flex-wrap gap-3">
                  {([24, 48] as const).map((hours) => (
                    <Button
                      key={hours}
                      type="button"
                      variant={form.policies.lateCancellationHours === hours ? "default" : "outline"}
                      aria-pressed={form.policies.lateCancellationHours === hours}
                      className="min-h-14"
                      onClick={() =>
                        setForm({ ...form, policies: { ...form.policies, lateCancellationHours: hours } })
                      }
                    >
                      {tx("{hours} hours", { hours })}
                    </Button>
                  ))}
                </div>
              </fieldset>
              {(
                [
                  ["studioCancellationCredit", "Studio-cancelled lessons earn a make-up credit"],
                  ["familyLateCancellationCredit", "Family late cancellations earn a make-up credit"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-5 border-y border-border py-5"
                >
                  <span className="text-lg">{tx(label)}</span>
                  <Switch
                    aria-label={tx(label)}
                    checked={form.policies[key]}
                    onCheckedChange={(value) =>
                      setForm({ ...form, policies: { ...form.policies, [key]: value } })
                    }
                    className="h-12 w-20 shrink-0 [&>span]:size-10 [&>span]:data-[state=checked]:translate-x-8"
                  />
                </label>
              ))}
            </>
          )}
          {data.step === 5 && (
            <>
              <div className="grid gap-4" role="group" aria-label={tx("Add students")}>
                {(
                  [
                    ["import", "Import a spreadsheet", FileSpreadsheet],
                    ["type", "Type them in", UserPlus],
                    ["later", "Do this later", Clock],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <Button
                    type="button"
                    key={value}
                    variant={form.students.entry === value ? "default" : "outline"}
                    aria-pressed={form.students.entry === value}
                    className="min-h-20 justify-start whitespace-normal px-5 text-xl"
                    onClick={() => {
                      setForm({ ...form, students: { entry: value } });
                      setStudentNotice(true);
                    }}
                  >
                    <Icon aria-hidden className="mr-2 size-6 shrink-0" />
                    {tx(label)}
                  </Button>
                ))}
              </div>
              {studentNotice && form.students.entry === "type" && (
                <p role="status" className="text-base text-muted-foreground">
                  {tx("Student entry is coming next; your choice will be saved.")}
                </p>
              )}
            </>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="mt-5 text-lg text-destructive">
            {error}
          </p>
        )}
        <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-border py-6">
          {data.step > 1 ? (
            <Button
              type="button"
              variant="outline"
              disabled={saving.isPending}
              onClick={() => {
                setError("");
                saving.mutate({ back: true });
              }}
            >
              <ArrowLeft aria-hidden />
              {tx("Back")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={saving.isPending} className="ml-auto min-h-14">
            {saving.isPending
              ? tx("Saving…")
              : data.step === 5
                ? tx("Complete setup")
                : tx("Continue")}
            <ArrowRight aria-hidden />
          </Button>
        </footer>
      </form>
    </div>
  );
}