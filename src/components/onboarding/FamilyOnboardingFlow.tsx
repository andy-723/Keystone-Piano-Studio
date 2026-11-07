import { useEffect, useMemo, useRef, useState, useEffectEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollectionNoticeScreen } from "@/components/terms/CollectionNoticeScreen";
import { EmergencyMedicalScreen } from "@/components/terms/EmergencyMedicalScreen";
import { HealthNotesConsentScreen } from "@/components/terms/HealthNotesConsentScreen";
import { PublicMediaConsentScreen } from "@/components/terms/PublicMediaConsentScreen";
import { TermsAcceptScreen } from "@/components/terms/TermsAcceptScreen";
import { FocusLayout } from "./FocusLayout";
import { ChoiceCards } from "./ChoiceCards";
import { tOnboarding } from "@/i18n/onboarding";
import { allStudentsAdult, buildSteps, goalLabel } from "@/lib/onboarding/steps";
import { enrolmentYear } from "@/lib/enrolment";
import type { ChildAnswers, FamilyAnswers } from "@/mocks/invitations";
import type { Lang } from "@/mocks/types";
import type { JoinSession } from "@/services/invitations";
import {
  autosaveJoinAnswers,
  requestFamilyMagicLink,
  submitJoinEnrolment,
  unlockJoinSession,
} from "@/services/invitations";
import { getFamilyAppTerms, getPublishedStudioTerms } from "@/services/terms";
import { PRIVACY_NOTICE_MARKDOWN, FAMILY_APP_TERMS_MARKDOWN } from "@/mocks/keystone-app-terms";
import { useAppSettings } from "@/lib/app-settings";

type ActiveSession = Extract<JoinSession, { state: "active" }>;

function childOf(
  answers: FamilyAnswers & { children?: Record<string, ChildAnswers> },
  id: string,
): ChildAnswers {
  return answers.children?.[id] ?? { firstName: "", lastName: "", birthYear: enrolmentYear - 8 };
}

export function FamilyOnboardingFlow({
  session,
  onSessionChange,
}: {
  session: JoinSession;
  onSessionChange?: ((session: JoinSession) => void) | undefined;
}) {
  if (session.state === "unavailable") {
    return (
      <FocusLayout
        studioName="Keystone Music HQ"
        progress={0}
        lang="en"
        onLangChange={() => undefined}
      >
        <h1 className="text-3xl font-semibold">{session.message}</h1>
        {session.replyToEmail && (
          <a
            className="mt-6 inline-block text-lg underline"
            href={`mailto:${session.replyToEmail}`}
          >
            {session.replyToEmail}
          </a>
        )}
      </FocusLayout>
    );
  }
  if (session.state === "completed") {
    return (
      <DonePanel
        teacherName={session.teacherName}
        email={session.loginEmail}
        guardianName=""
        lang="en"
      />
    );
  }
  return <ActiveFlow session={session} onSessionChange={onSessionChange} />;
}

function DonePanel({
  teacherName,
  email,
  guardianName,
  lang,
}: {
  teacherName: string;
  email: string;
  guardianName: string;
  lang: Lang;
}) {
  const [sent, setSent] = useState(false);
  const [mfa, setMfa] = useState(false);
  const login = useMutation({
    mutationFn: () => requestFamilyMagicLink({ email }),
    onSuccess: () => setSent(true),
  });
  return (
    <FocusLayout
      studioName="Keystone Music HQ"
      progress={1}
      lang={lang}
      onLangChange={() => undefined}
    >
      <h1 className="text-3xl font-semibold">
        {guardianName
          ? tOnboarding(lang, "thanks", { name: guardianName, teacher: teacherName })
          : tOnboarding(lang, "alreadyDone")}
      </h1>
      <Button
        className="mt-8 min-h-14"
        disabled={login.isPending || sent}
        onClick={() => login.mutate()}
      >
        {tOnboarding(lang, "createLogin")}
      </Button>
      {sent && <p className="mt-4 text-success">{tOnboarding(lang, "loginSent")}</p>}
      {sent && !mfa && (
        <div className="mt-8 space-y-3">
          <Button variant="outline" onClick={() => setMfa(true)}>
            {tOnboarding(lang, "addAuthenticator")}
          </Button>
          <Button variant="ghost" onClick={() => setMfa(true)}>
            {tOnboarding(lang, "skipMfa")}
          </Button>
        </div>
      )}
    </FocusLayout>
  );
}

function ActiveFlow({
  session,
  onSessionChange,
}: {
  session: ActiveSession;
  onSessionChange?: ((session: JoinSession) => void) | undefined;
}) {
  const { largeText } = useAppSettings();
  const [lang, setLang] = useState<Lang>(session.language);
  const [answers, setAnswers] = useState(session.answers);
  const [stepId, setStepId] = useState(session.currentStep || "collection");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [done, setDone] = useState<{
    guardianName: string;
    teacherName: string;
    email: string;
  } | null>(null);
  const [termsMeta, setTermsMeta] = useState<{
    versionId: string;
    appId: string;
    versionNo: number;
    effectiveAt: string;
    markdown: string;
    moneyRules: {
      billingCycle: string;
      lateFee: string;
      cancelNotice: string;
      makeUps: string;
      stopNotice: string;
    };
  } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const steps = useMemo(() => buildSteps(session.students, answers), [session.students, answers]);
  const stepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === stepId),
  );
  const step = steps[stepIndex] ?? steps[0]!;
  const progress = steps.length <= 1 ? 0 : stepIndex / (steps.length - 1);

  useEffect(() => {
    getPublishedStudioTerms("demo").then(async (published) => {
      const version = published.pending ?? published.current;
      const app = await getFamilyAppTerms();
      if (!version || !app.version) return;
      const billing = version.mergeValues["billing"] as {
        cycle?: string;
        lateFee?: number;
        lateFeeAfterDays?: number;
        withdrawalNoticeWeeks?: number;
      };
      const policies = version.mergeValues["policies"] as {
        cancelNoticeHours?: number;
        makeUpQuota?: number;
        makeUpPeriod?: string;
      };
      setTermsMeta({
        versionId: version.id,
        appId: app.version.id,
        versionNo: version.versionNo,
        effectiveAt: version.effectiveAt.slice(0, 10),
        markdown: version.renderedMarkdown,
        moneyRules: {
          billingCycle: `Billing: ${billing?.cycle ?? "per_term"}`,
          lateFee: `Late fee: $${billing?.lateFee ?? 15} after ${billing?.lateFeeAfterDays ?? 7} days`,
          cancelNotice: `Cancel notice: ${policies?.cancelNoticeHours ?? 24} hours`,
          makeUps: `Make-ups: ${policies?.makeUpQuota ?? 1} per ${policies?.makeUpPeriod ?? "term"}`,
          stopNotice: `Stop notice: ${billing?.withdrawalNoticeWeeks ?? 4} weeks`,
        },
      });
    });
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step.id]);

  const persist = useEffectEvent(async (nextAnswers: typeof answers, nextStep: string) => {
    const result = await autosaveJoinAnswers({
      token: session.token,
      answers: nextAnswers,
      currentStep: nextStep,
    });
    setSavedAt(result.savedAt);
  });

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void persist(answers, step.id);
    }, 500);
    return () => window.clearTimeout(handle);
  }, [answers, step.id, persist]);

  const unlock = useMutation({
    mutationFn: () => unlockJoinSession({ token: session.token, turnstileToken: "mock-ok" }),
  });
  const submit = useMutation({
    mutationFn: () =>
      submitJoinEnrolment({
        token: session.token,
        answers,
        turnstileToken: "mock-ok",
      }),
    onSuccess: (result) => {
      setDone({
        guardianName: result.guardianName,
        teacherName: result.teacherName,
        email: result.email,
      });
      onSessionChange?.({
        state: "completed",
        teacherName: result.teacherName,
        loginEmail: result.email,
      });
    },
  });

  const go = (delta: number) => {
    const next = steps[stepIndex + delta];
    if (next) setStepId(next.id);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        go(-1);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        go(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (done) {
    return (
      <DonePanel
        teacherName={done.teacherName}
        email={done.email}
        guardianName={done.guardianName}
        lang={lang}
      />
    );
  }

  const names = session.students.map((s) => s.firstName).join(lang === "zh-CN" ? "、" : " & ");
  const patchFamily = (patch: Record<string, unknown>) =>
    setAnswers((current) => ({ ...current, ...patch }));
  const patchChild = (studentId: string, patch: Record<string, unknown>) =>
    setAnswers((current) => ({
      ...current,
      children: {
        ...current.children,
        [studentId]: { ...childOf(current, studentId), ...patch } as ChildAnswers,
      },
    }));

  const frameClass = reduceMotion ? "" : "animate-in fade-in slide-in-from-bottom-2 duration-300";
  const textSize = largeText ? "text-xl" : "text-lg";

  let body: React.ReactNode = null;
  if (step.id === "collection") {
    body = (
      <div className="space-y-6">
        <div>
          <p className="text-base text-muted-foreground">{session.teacherName}</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-3xl font-semibold sm:text-4xl">
            {session.studioName}
          </h1>
          <p className={`mt-3 ${textSize}`}>{tOnboarding(lang, "enrolAbout", { names })}</p>
        </div>
        <CollectionNoticeScreen
          lang={lang}
          value={{ acknowledged: Boolean(answers.collectionAcknowledged) }}
          onChange={(value) => patchFamily({ collectionAcknowledged: value.acknowledged })}
          onNext={async () => {
            await unlock.mutateAsync();
            patchFamily({ collectionAcknowledged: true, turnstileUnlocked: true });
            go(1);
          }}
        />
        <div
          aria-hidden
          className="min-h-12 rounded-md border border-dashed border-border"
          data-testid="turnstile-slot"
        />
      </div>
    );
  } else if (step.id === "filler") {
    const offerSelf = allStudentsAdult(session.students);
    body = (
      <Question
        headingRef={headingRef}
        title={tOnboarding(lang, "whoFilling")}
        onBack={() => go(-1)}
        onOk={() => answers.fillerName?.trim() && answers.relationship && go(1)}
        lang={lang}
      >
        <label className="block font-semibold">
          {tOnboarding(lang, "yourName")}
          <Input
            className="mt-2 min-h-12 text-base"
            value={answers.fillerName ?? ""}
            onChange={(e) => patchFamily({ fillerName: e.target.value })}
          />
        </label>
        <p className="mt-5 font-semibold">{tOnboarding(lang, "relationship")}</p>
        <ChoiceCards
          value={answers.relationship || undefined}
          onSelect={(key) => {
            patchFamily({ relationship: key as FamilyAnswers["relationship"] });
            window.setTimeout(() => go(1), 400);
          }}
          options={[
            { key: "parent", letter: "A", label: tOnboarding(lang, "parent") },
            { key: "legal_guardian", letter: "B", label: tOnboarding(lang, "legalGuardian") },
            ...(offerSelf
              ? [{ key: "self", letter: "C", label: tOnboarding(lang, "myself") }]
              : []),
          ]}
        />
      </Question>
    );
  } else if (step.id === "mobile") {
    body = (
      <Question
        headingRef={headingRef}
        title={tOnboarding(lang, "mobile")}
        helper={tOnboarding(lang, "mobileHint")}
        onBack={() => go(-1)}
        onOk={() => answers.mobile?.trim() && go(1)}
        lang={lang}
      >
        <Input
          className="min-h-12 text-base"
          inputMode="tel"
          value={answers.mobile ?? ""}
          onChange={(e) => patchFamily({ mobile: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && go(1)}
        />
      </Question>
    );
  } else if (step.kind === "child") {
    const student = session.students.find((s) => s.id === step.studentId)!;
    const child = childOf(answers, student.id);
    const idx = session.students.findIndex((s) => s.id === student.id);
    const header = `${student.firstName} · ${idx + 1} of ${session.students.length}`;
    const childStep = step.id.split(":").at(-1);
    if (childStep === "identity") {
      body = (
        <Question
          headingRef={headingRef}
          title={tOnboarding(lang, "confirmName")}
          eyebrow={header}
          onBack={() => go(-1)}
          onOk={() => child.firstName && child.lastName && child.birthYear && go(1)}
          lang={lang}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block font-semibold">
              {tOnboarding(lang, "firstName")}
              <Input
                className="mt-2 min-h-12 text-base"
                value={child.firstName}
                onChange={(e) => patchChild(student.id, { firstName: e.target.value })}
              />
            </label>
            <label className="block font-semibold">
              {tOnboarding(lang, "lastName")}
              <Input
                className="mt-2 min-h-12 text-base"
                value={child.lastName}
                onChange={(e) => patchChild(student.id, { lastName: e.target.value })}
              />
            </label>
          </div>
          <label className="mt-4 block font-semibold">
            {tOnboarding(lang, "birthYear")}
            <Input
              className="mt-2 min-h-12 text-base"
              type="number"
              value={child.birthYear}
              onChange={(e) => patchChild(student.id, { birthYear: Number(e.target.value) })}
            />
          </label>
          <label className="mt-4 block font-semibold">
            {tOnboarding(lang, "dob")}
            <Input
              className="mt-2 min-h-12 text-base"
              type="date"
              value={child.dateOfBirth ?? ""}
              onChange={(e) => patchChild(student.id, { dateOfBirth: e.target.value })}
            />
          </label>
        </Question>
      );
    } else if (childStep === "experience") {
      body = (
        <Question
          headingRef={headingRef}
          title={tOnboarding(lang, "experience")}
          eyebrow={header}
          onBack={() => go(-1)}
          lang={lang}
        >
          <ChoiceCards
            value={child.experience}
            onSelect={(key) => {
              patchChild(student.id, { experience: key as ChildAnswers["experience"] });
              window.setTimeout(() => go(1), 400);
            }}
            options={[
              { key: "beginner", letter: "A", label: tOnboarding(lang, "beginner") },
              { key: "transferring", letter: "B", label: tOnboarding(lang, "transferring") },
            ]}
          />
        </Question>
      );
    } else if (childStep === "previousGrades" || childStep === "theoryExams") {
      const key = childStep === "previousGrades" ? "previousGrades" : "theoryExams";
      body = (
        <Question
          headingRef={headingRef}
          title={tOnboarding(lang, key)}
          eyebrow={header}
          onBack={() => go(-1)}
          onOk={() => go(1)}
          lang={lang}
        >
          <Input
            className="min-h-12 text-base"
            value={child[key] ?? ""}
            onChange={(e) => patchChild(student.id, { [key]: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && go(1)}
          />
        </Question>
      );
    } else if (childStep === "instrument") {
      body = (
        <Question
          headingRef={headingRef}
          title={tOnboarding(lang, "instrument")}
          eyebrow={header}
          onBack={() => go(-1)}
          lang={lang}
        >
          <ChoiceCards
            value={child.instrument}
            onSelect={(key) => {
              patchChild(student.id, { instrument: key as ChildAnswers["instrument"] });
              window.setTimeout(() => go(1), 400);
            }}
            options={[
              { key: "acoustic", letter: "A", label: tOnboarding(lang, "acoustic") },
              { key: "digital", letter: "B", label: tOnboarding(lang, "digital") },
              { key: "keyboard", letter: "C", label: tOnboarding(lang, "keyboard") },
              { key: "not_yet", letter: "D", label: tOnboarding(lang, "notYet") },
            ]}
          />
        </Question>
      );
    } else if (childStep === "goal") {
      body = (
        <Question
          headingRef={headingRef}
          title={tOnboarding(lang, "goal")}
          eyebrow={header}
          onBack={() => go(-1)}
          lang={lang}
        >
          <ChoiceCards
            value={child.goalKind}
            onSelect={(key) => {
              patchChild(student.id, { goalKind: key as ChildAnswers["goalKind"] });
              window.setTimeout(() => go(1), 400);
            }}
            options={[
              { key: "exams", letter: "A", label: tOnboarding(lang, "exams") },
              { key: "fun", letter: "B", label: tOnboarding(lang, "fun") },
              { key: "school", letter: "C", label: tOnboarding(lang, "school") },
              { key: "other", letter: "D", label: tOnboarding(lang, "other") },
            ]}
          />
        </Question>
      );
    } else if (childStep === "examBoard") {
      body = (
        <Question
          headingRef={headingRef}
          title={tOnboarding(lang, "examBoard")}
          eyebrow={header}
          onBack={() => go(-1)}
          lang={lang}
        >
          <ChoiceCards
            value={child.examBoard}
            onSelect={(key) => {
              patchChild(student.id, { examBoard: key as ChildAnswers["examBoard"] });
              window.setTimeout(() => go(1), 400);
            }}
            options={[
              { key: "AMEB", letter: "A", label: "AMEB" },
              { key: "Trinity", letter: "B", label: "Trinity" },
              { key: "ABRSM", letter: "C", label: "ABRSM" },
              { key: "unsure", letter: "D", label: tOnboarding(lang, "unsure") },
            ]}
          />
        </Question>
      );
    } else if (childStep === "goalOther") {
      body = (
        <Question
          headingRef={headingRef}
          title={tOnboarding(lang, "goalOther")}
          eyebrow={header}
          onBack={() => go(-1)}
          onOk={() => child.goalOther?.trim() && go(1)}
          lang={lang}
        >
          <Input
            className="min-h-12 text-base"
            value={child.goalOther ?? ""}
            onChange={(e) => patchChild(student.id, { goalOther: e.target.value })}
          />
        </Question>
      );
    } else if (childStep === "days") {
      body = (
        <Question
          headingRef={headingRef}
          title={tOnboarding(lang, "days")}
          eyebrow={header}
          onBack={() => go(-1)}
          lang={lang}
        >
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
              <Button
                key={day}
                type="button"
                variant={child.daysPerWeek === day ? "default" : "outline"}
                className="min-h-12 min-w-12"
                onClick={() => {
                  patchChild(student.id, { daysPerWeek: day });
                  window.setTimeout(() => go(1), 400);
                }}
              >
                {day}
              </Button>
            ))}
          </div>
        </Question>
      );
    } else if (childStep === "minutes") {
      body = (
        <Question
          headingRef={headingRef}
          title={tOnboarding(lang, "minutes")}
          eyebrow={header}
          onBack={() => go(-1)}
          lang={lang}
        >
          <div className="flex flex-wrap gap-2">
            {[10, 15, 20, 30, 45, 60].map((minutes) => (
              <Button
                key={minutes}
                type="button"
                variant={child.minutesPerDay === minutes ? "default" : "outline"}
                className="min-h-12"
                onClick={() => {
                  patchChild(student.id, { minutesPerDay: minutes });
                  window.setTimeout(() => go(1), 400);
                }}
              >
                {minutes}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              className="min-h-12"
              onClick={() =>
                patchChild(student.id, { minutesPerDay: Number(child.minutesOther) || 25 })
              }
            >
              {tOnboarding(lang, "other")}
            </Button>
          </div>
        </Question>
      );
    } else if (childStep === "notes") {
      body = (
        <Question
          headingRef={headingRef}
          title={tOnboarding(lang, "notes")}
          helper={tOnboarding(lang, "notesHint")}
          eyebrow={header}
          onBack={() => go(-1)}
          onOk={() => go(1)}
          lang={lang}
        >
          <textarea
            className="min-h-28 w-full rounded-md border border-input bg-card px-3 py-2 text-base"
            value={child.teacherNotes ?? ""}
            onChange={(e) =>
              patchChild(student.id, { teacherNotes: e.target.value, healthNotes: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                go(1);
              }
            }}
          />
        </Question>
      );
    } else if (childStep === "emergency") {
      body = (
        <div className={frameClass}>
          <p className="mb-3 text-sm text-muted-foreground">{header}</p>
          <EmergencyMedicalScreen
            lang={lang}
            value={{ granted: child.emergencyMedical ?? null }}
            onChange={(value) => patchChild(student.id, { emergencyMedical: value.granted })}
            onBack={() => go(-1)}
            onNext={() => go(1)}
          />
        </div>
      );
    } else if (childStep === "healthConsent") {
      body = (
        <div className={frameClass}>
          <p className="mb-3 text-sm text-muted-foreground">{header}</p>
          <HealthNotesConsentScreen
            lang={lang}
            value={{ granted: child.healthNotesConsent ?? null }}
            onChange={(value) => patchChild(student.id, { healthNotesConsent: value.granted })}
            onBack={() => go(-1)}
            onNext={() => go(1)}
          />
        </div>
      );
    } else if (childStep === "media") {
      body = (
        <div className={frameClass}>
          <p className="mb-3 text-sm text-muted-foreground">{header}</p>
          <PublicMediaConsentScreen
            lang={lang}
            studentName={student.firstName}
            studentAge={enrolmentYear - student.birthYear}
            value={{ granted: child.mediaPublic ?? null }}
            onChange={(value) => patchChild(student.id, { mediaPublic: value.granted })}
            onBack={() => go(-1)}
            onNext={() => go(1)}
          />
        </div>
      );
    }
  } else if (step.id === "terms" && termsMeta) {
    const requiresGuardian = session.students.some((s) => enrolmentYear - s.birthYear < 18);
    body = (
      <TermsAcceptScreen
        lang={lang}
        studioName={session.studioName}
        versionNo={termsMeta.versionNo}
        effectiveAt={termsMeta.effectiveAt}
        moneyRules={termsMeta.moneyRules}
        agreementMarkdown={termsMeta.markdown}
        requiresGuardian={requiresGuardian}
        value={{
          studioAgreed: Boolean(answers.terms?.studioAgreed),
          keystoneAgreed: Boolean(answers.terms?.keystoneAgreed),
          guardianDeclaration: Boolean(answers.terms?.guardianDeclaration),
          typedName: answers.terms?.typedName ?? answers.fillerName ?? "",
          relationship: (answers.terms?.relationship || answers.relationship || "") as
            "" | "parent" | "legal_guardian" | "self",
        }}
        onChange={(value) =>
          patchFamily({ terms: value, relationship: value.relationship || answers.relationship })
        }
        onBack={() => go(-1)}
        onNext={() => go(1)}
        onOpenAppTerms={() => window.alert(FAMILY_APP_TERMS_MARKDOWN.slice(0, 500))}
        onOpenPrivacyNotice={() => window.alert(PRIVACY_NOTICE_MARKDOWN.slice(0, 500))}
      />
    );
  } else if (step.id === "review") {
    body = (
      <div className={`space-y-6 ${frameClass}`}>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold">
          {tOnboarding(lang, "review")}
        </h1>
        {session.students.map((student) => {
          const child = childOf(answers, student.id);
          return (
            <section key={student.id} className="border-y border-border py-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-2xl font-semibold">{student.firstName}</h2>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setStepId(`child:${student.id}:identity`)}
                >
                  {tOnboarding(lang, "edit")}
                </Button>
              </div>
              <p className="mt-2">
                {child.experience === "transferring"
                  ? tOnboarding(lang, "transferring")
                  : tOnboarding(lang, "beginner")}
              </p>
              <p>{goalLabel(child)}</p>
              <p>
                {child.daysPerWeek} × {child.minutesPerDay} min
              </p>
            </section>
          );
        })}
        <div className="sticky bottom-0 flex flex-wrap justify-between gap-3 bg-[hsl(40_33%_96%)] py-4">
          <Button type="button" variant="outline" onClick={() => go(-1)}>
            <ArrowLeft aria-hidden />
            {tOnboarding(lang, "back")}
          </Button>
          <Button type="button" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {tOnboarding(lang, "submit")}
          </Button>
        </div>
        {submit.error && (
          <p role="alert" className="text-destructive">
            {submit.error.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <FocusLayout
      studioName={session.studioName}
      progress={progress}
      lang={lang}
      onLangChange={setLang}
    >
      <div className={frameClass}>
        {body}
        {savedAt && (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            {tOnboarding(lang, "saved")}
          </p>
        )}
      </div>
    </FocusLayout>
  );
}

function Question({
  title,
  helper,
  eyebrow,
  children,
  onBack,
  onOk,
  lang,
  headingRef,
}: {
  title: string;
  helper?: string;
  eyebrow?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onOk?: () => void;
  lang: Lang;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section className="space-y-5">
      {eyebrow && <p className="text-sm text-muted-foreground">{eyebrow}</p>}
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold sm:text-4xl">
        {title}
      </h1>
      {helper && <p className="text-base text-muted-foreground">{helper}</p>}
      {children}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 bg-[hsl(40_33%_96%)] py-4">
        {onBack ? (
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft aria-hidden />
            {tOnboarding(lang, "back")}
          </Button>
        ) : (
          <span />
        )}
        {onOk && (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground md:inline">
              {tOnboarding(lang, "pressEnter")}
            </span>
            <Button type="button" className="min-h-12" onClick={onOk}>
              {tOnboarding(lang, "ok")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
