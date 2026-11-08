import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { enrolmentYear } from "@/lib/enrolment";
import { isAdultStudent } from "@/lib/enrolment";
import type { Lang } from "@/mocks/types";
import { acceptStudioTerms, getFamilyAppTerms, getPublishedStudioTerms } from "@/services/terms";
import { CollectionNoticeScreen, type CollectionNoticeValue } from "./CollectionNoticeScreen";
import { EmergencyMedicalScreen, type EmergencyMedicalValue } from "./EmergencyMedicalScreen";
import { HealthNotesConsentScreen, type HealthNotesConsentValue } from "./HealthNotesConsentScreen";
import { PublicMediaConsentScreen, type PublicMediaConsentValue } from "./PublicMediaConsentScreen";
import { TermsAcceptScreen, type TermsAcceptValue } from "./TermsAcceptScreen";

type Step = "collection" | "emergency" | "health" | "media" | "terms";

export function IntakeTermsFlow({
  lang,
  studentIds,
  studentName,
  birthYear,
  healthNotes,
  scope = "demo",
  onComplete,
}: {
  lang: Lang;
  studentIds: string[];
  studentName: string;
  birthYear: number;
  healthNotes?: string;
  scope?: "demo" | "new-studio";
  onComplete: () => void;
}) {
  const hasHealthNotes = Boolean(healthNotes?.trim());
  const age = enrolmentYear - birthYear;
  const requiresGuardian = !isAdultStudent(birthYear);
  const steps: Step[] = ["collection", "emergency", ...(hasHealthNotes ? (["health"] as Step[]) : []), "media", "terms"];
  const [index, setIndex] = useState(0);
  const step = steps[index] ?? "terms";
  const [collection, setCollection] = useState<CollectionNoticeValue>({ acknowledged: false });
  const [emergency, setEmergency] = useState<EmergencyMedicalValue>({ granted: null });
  const [health, setHealth] = useState<HealthNotesConsentValue>({ granted: null });
  const [media, setMedia] = useState<PublicMediaConsentValue>({ granted: null });
  const [terms, setTerms] = useState<TermsAcceptValue>({
    studioAgreed: false,
    keystoneAgreed: false,
    guardianDeclaration: false,
    typedName: "",
    relationship: requiresGuardian ? "" : "self",
  });
  const [dialog, setDialog] = useState<"app" | "privacy" | "studio" | null>(null);
  const published = useQuery({ queryKey: ["published-studio-terms", scope], queryFn: () => getPublishedStudioTerms(scope) });
  const appTerms = useQuery({ queryKey: ["family-app-terms"], queryFn: getFamilyAppTerms });
  const client = useQueryClient();
  const accept = useMutation({
    mutationFn: async () => {
      const version = published.data?.pending ?? published.data?.current;
      const appVersion = appTerms.data?.version;
      if (!version || !appVersion) throw new Error("Studio terms are not published yet.");
      const consents = [
        ...studentIds.map((studentId) => ({ type: "emergency_medical" as const, granted: Boolean(emergency.granted), studentId })),
        ...studentIds.map((studentId) => ({ type: "media_public" as const, granted: Boolean(media.granted), studentId })),
        ...(hasHealthNotes
          ? studentIds.map((studentId) => ({ type: "health_notes" as const, granted: Boolean(health.granted), studentId }))
          : []),
      ];
      return acceptStudioTerms({
        versionId: version.id,
        appTermsVersionId: appVersion.id,
        typedName: terms.typedName,
        capacity: requiresGuardian ? "guardian" : "self",
        relationship: requiresGuardian ? (terms.relationship === "legal_guardian" ? "legal_guardian" : "parent") : "self",
        guardianDeclaration: requiresGuardian ? terms.guardianDeclaration : false,
        studentIds,
        consents,
        scope,
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["terms"] });
      onComplete();
    },
  });

  const version = published.data?.pending ?? published.data?.current;
  const money = version?.mergeValues["billing"] as Record<string, unknown> | undefined;
  const policies = version?.mergeValues["policies"] as Record<string, unknown> | undefined;

  const goNext = () => {
    if (index >= steps.length - 1) accept.mutate();
    else setIndex(index + 1);
  };
  const goBack = () => setIndex(Math.max(0, index - 1));

  if (published.isLoading || appTerms.isLoading) return <p>{lang === "zh-CN" ? "加载条款…" : "Loading terms…"}</p>;
  if (!version) return <p role="alert">{lang === "zh-CN" ? "琴行尚未发布条款。" : "Studio terms are not published yet."}</p>;

  return (
    <div className="mt-5 space-y-4">
      {step === "collection" && (
        <CollectionNoticeScreen lang={lang} value={collection} onChange={setCollection} onNext={goNext} onOpenPrivacy={() => setDialog("studio")} />
      )}
      {step === "emergency" && (
        <EmergencyMedicalScreen lang={lang} value={emergency} onChange={setEmergency} onNext={goNext} onBack={goBack} />
      )}
      {step === "health" && (
        <HealthNotesConsentScreen lang={lang} value={health} onChange={setHealth} onNext={goNext} onBack={goBack} />
      )}
      {step === "media" && (
        <PublicMediaConsentScreen lang={lang} value={media} onChange={setMedia} onNext={goNext} onBack={goBack} studentName={studentName} studentAge={age} />
      )}
      {step === "terms" && (
        <TermsAcceptScreen
          lang={lang}
          value={terms}
          onChange={setTerms}
          onNext={goNext}
          onBack={goBack}
          studioName={String((version.mergeValues["studio"] as Record<string, unknown> | undefined)?.["name"] ?? "Studio")}
          versionNo={version.versionNo}
          effectiveAt={version.effectiveAt}
          agreementMarkdown={version.renderedMarkdown}
          appTermsMarkdown={appTerms.data?.appTermsMarkdown}
          privacyNoticeMarkdown={appTerms.data?.privacyNoticeMarkdown}
          appVersionNo={appTerms.data?.version?.versionNo}
          requiresGuardian={requiresGuardian}
          onOpenAppTerms={() => setDialog("app")}
          onOpenPrivacyNotice={() => setDialog("privacy")}
          moneyRules={{
            billingCycle: lang === "zh-CN" ? `账单周期：${money?.["cycle"] ?? ""}` : `Billing: ${money?.["cycle"] ?? ""}`,
            lateFee: lang === "zh-CN" ? `逾期费：A$${money?.["lateFee"] ?? ""}` : `Late fee: A$${money?.["lateFee"] ?? ""} after ${money?.["lateFeeAfterDays"] ?? ""} days`,
            cancelNotice: lang === "zh-CN" ? `取消通知：${policies?.["cancelNoticeHours"] ?? ""} 小时` : `Cancellation notice: ${policies?.["cancelNoticeHours"] ?? ""} hours`,
            makeUps: lang === "zh-CN" ? `补课：每${policies?.["makeUpPeriod"] ?? ""} ${policies?.["makeUpQuota"] ?? ""} 次` : `Make-ups: ${policies?.["makeUpQuota"] ?? ""} per ${policies?.["makeUpPeriod"] ?? ""}`,
            stopNotice: lang === "zh-CN" ? `停课通知：${money?.["withdrawalNoticeWeeks"] ?? ""} 周` : `Notice to stop: ${money?.["withdrawalNoticeWeeks"] ?? ""} weeks`,
          }}
        />
      )}
      {accept.isError && <p role="alert" className="text-destructive">{(accept.error as Error).message}</p>}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle>{dialog === "app" ? "App terms" : dialog === "privacy" ? "Privacy notice" : "Studio agreement"}</DialogTitle>
          <pre className="whitespace-pre-wrap font-sans text-base">
            {dialog === "app" ? appTerms.data?.appTermsMarkdown : dialog === "privacy" ? appTerms.data?.privacyNoticeMarkdown : version.renderedMarkdown}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
