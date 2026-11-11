import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadDocumentPdf } from "@/lib/download-terms-pdf";
import { PART4_TERMS_ACCEPT } from "@/mocks/legal-template-au";
import type { AcceptanceRelationship } from "@/mocks/terms";
import type { Lang } from "@/mocks/types";
import type { TermsScreenProps } from "./types";

export type TermsAcceptValue = {
  studioAgreed: boolean;
  keystoneAgreed: boolean;
  guardianDeclaration: boolean;
  typedName: string;
  relationship: AcceptanceRelationship | "";
};

export function TermsAcceptScreen({
  value,
  onChange,
  onNext,
  onBack,
  lang = "en",
  studioName,
  versionNo,
  effectiveAt,
  moneyRules,
  agreementMarkdown,
  appTermsMarkdown,
  privacyNoticeMarkdown,
  appVersionNo,
  requiresGuardian,
  onOpenAppTerms,
  onOpenPrivacyNotice,
}: TermsScreenProps<TermsAcceptValue> & {
  lang?: Lang;
  studioName: string;
  versionNo: number;
  effectiveAt: string;
  moneyRules: { billingCycle: string; lateFee: string; cancelNotice: string; makeUps: string; stopNotice: string };
  agreementMarkdown: string;
  /** Full Keystone family app terms (Parts A–D). Shown in the scrolling Keystone panel. */
  appTermsMarkdown?: string | undefined;
  /** Part C privacy notice (merged). Used for the Part C link / PDF when provided. */
  privacyNoticeMarkdown?: string | undefined;
  appVersionNo?: number | undefined;
  requiresGuardian: boolean;
  onOpenAppTerms?: () => void;
  onOpenPrivacyNotice?: () => void;
}) {
  const [openPart, setOpenPart] = useState<string | null>("full");
  const appVersion = appVersionNo ?? 1;
  const appBody = appTermsMarkdown ?? "";
  const partCSplit = appBody.includes("## Part C")
    ? appBody.split(/(?=## Part C)/)
    : [appBody, privacyNoticeMarkdown ?? ""];
  const appBeforePartC = partCSplit[0]?.trim() ?? "";
  const appPartCAndAfter = (partCSplit.slice(1).join("") || privacyNoticeMarkdown || "").trim();
  const studioTick = (lang === "zh-CN"
    ? `我同意 ${studioName} 的条款与免责声明（第 ${versionNo} 版，生效于 ${effectiveAt}），并已阅读其隐私政策。`
    : PART4_TERMS_ACCEPT.studioTick
        .replaceAll("{{studio.tradingName}}", studioName)
        .replaceAll("{{studio.name}}", studioName)
        .replaceAll("{{terms.versionNo}}", String(versionNo))
        .replaceAll("{{terms.effectiveAt}}", effectiveAt));
  const keystoneTick = (lang === "zh-CN"
    ? `我同意 Keystone Music HQ 的应用使用条款（第 ${appVersion} 版），并已阅读其隐私声明。`
    : PART4_TERMS_ACCEPT.keystoneTick.replaceAll("{{terms.appVersion}}", String(appVersion)));
  const canSubmit =
    value.studioAgreed &&
    value.keystoneAgreed &&
    value.typedName.trim().split(/\s+/).filter(Boolean).length >= 2 &&
    (!requiresGuardian || (value.guardianDeclaration && (value.relationship === "parent" || value.relationship === "legal_guardian")));

  const scrollToPartC = () => {
    const el = document.getElementById("keystone-part-c");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    onOpenPrivacyNotice?.();
  };

  return (
    <section className="space-y-5" aria-label={lang === "zh-CN" ? "接受条款" : "Accept terms"}>
      <h2 className="text-2xl font-semibold">{lang === "zh-CN" ? "接受琴行条款" : "Accept studio terms"}</h2>
      <div className="border-y border-border py-4">
        <h3 className="text-xl font-semibold">{lang === "zh-CN" ? "费用规则摘要" : PART4_TERMS_ACCEPT.moneyRulesTitle}</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-base">
          <li>{moneyRules.billingCycle}</li>
          <li>{moneyRules.lateFee}</li>
          <li>{moneyRules.cancelNotice}</li>
          <li>{moneyRules.makeUps}</li>
          <li>{moneyRules.stopNotice}</li>
        </ul>
      </div>
      <details open={openPart === "full"} onToggle={(event) => setOpenPart((event.target as HTMLDetailsElement).open ? "full" : null)} className="border-b border-border py-3">
        <summary className="min-h-12 cursor-pointer text-lg font-semibold">{lang === "zh-CN" ? "完整协议" : "Full agreement"}</summary>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-base">{agreementMarkdown}</pre>
      </details>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void downloadDocumentPdf({
            title: `${studioName} — Studio agreement v${versionNo}`,
            body: agreementMarkdown,
            filename: `studio-agreement-v${versionNo}.pdf`,
          });
        }}
      >
        {lang === "zh-CN" ? "下载 PDF" : "Download PDF"}
      </Button>
      <label className="flex min-h-12 cursor-pointer items-start gap-3">
        <input className="mt-1 size-6 shrink-0 accent-primary" type="checkbox" checked={value.studioAgreed} onChange={(event) => onChange({ ...value, studioAgreed: event.target.checked })} />
        <span>{studioTick}</span>
      </label>
      {requiresGuardian && (
        <>
          <label className="flex min-h-12 cursor-pointer items-start gap-3">
            <input className="mt-1 size-6 shrink-0 accent-primary" type="checkbox" checked={value.guardianDeclaration} onChange={(event) => onChange({ ...value, guardianDeclaration: event.target.checked })} />
            <span>{lang === "zh-CN" ? "我是本报名中每位未满 18 岁学生的父母或法定监护人，并代其接受这些条款。" : PART4_TERMS_ACCEPT.guardianTick}</span>
          </label>
          <label className="block font-semibold">
            {lang === "zh-CN" ? "您的关系" : PART4_TERMS_ACCEPT.relationshipLabel}
            <select
              className="mt-2 min-h-12 w-full rounded-md border border-input bg-card px-3 text-lg"
              value={value.relationship}
              onChange={(event) => {
                const next = event.target.value;
                onChange({ ...value, relationship: next === "parent" || next === "legal_guardian" ? next : "" });
              }}
            >
              <option value="">{lang === "zh-CN" ? "请选择" : "Choose"}</option>
              <option value="parent">{lang === "zh-CN" ? "父母" : PART4_TERMS_ACCEPT.relationshipParent}</option>
              <option value="legal_guardian">{lang === "zh-CN" ? "法定监护人" : PART4_TERMS_ACCEPT.relationshipGuardian}</option>
            </select>
          </label>
        </>
      )}
      <label className="block font-semibold">
        {lang === "zh-CN" ? "请输入全名" : PART4_TERMS_ACCEPT.typedNameLabel}
        <Input className="mt-2 min-h-12" value={value.typedName} onChange={(event) => onChange({ ...value, typedName: event.target.value })} />
      </label>
      <div className="rounded-md border-2 border-primary/40 bg-secondary/40 p-4">
        <h3 className="text-lg font-semibold">{lang === "zh-CN" ? "Keystone Music HQ（您琴行使用的应用）" : PART4_TERMS_ACCEPT.keystoneBoxTitle}</h3>
        {(appBeforePartC || appPartCAndAfter) ? (
          <div className="mt-3 max-h-80 overflow-y-auto rounded-md border border-border bg-card p-3" aria-label={lang === "zh-CN" ? "Keystone 应用条款与隐私声明" : "Keystone app terms and privacy notice"}>
            {appBeforePartC ? <pre className="whitespace-pre-wrap font-sans text-base">{appBeforePartC}</pre> : null}
            {appPartCAndAfter ? (
              <pre id="keystone-part-c" className="mt-4 scroll-mt-3 whitespace-pre-wrap font-sans text-base">{appPartCAndAfter}</pre>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="link" className="min-h-12 px-0" onClick={scrollToPartC}>
            {lang === "zh-CN" ? "Keystone 完整隐私政策（Part C）" : "Keystone full privacy policy (Part C)"}
          </Button>
          {onOpenAppTerms ? (
            <Button type="button" variant="link" className="min-h-12 px-0" onClick={onOpenAppTerms}>
              {lang === "zh-CN" ? "应用使用条款" : "App terms of use"}
            </Button>
          ) : null}
          {onOpenPrivacyNotice ? (
            <Button type="button" variant="link" className="min-h-12 px-0" onClick={onOpenPrivacyNotice}>
              {lang === "zh-CN" ? "隐私声明" : "Privacy notice"}
            </Button>
          ) : null}
        </div>
        <label className="mt-3 flex min-h-12 cursor-pointer items-start gap-3">
          <input className="mt-1 size-6 shrink-0 accent-primary" type="checkbox" checked={value.keystoneAgreed} onChange={(event) => onChange({ ...value, keystoneAgreed: event.target.checked })} />
          <span>{keystoneTick}</span>
        </label>
      </div>
      <div className="flex flex-wrap justify-between gap-3">
        {onBack ? <Button type="button" variant="outline" onClick={onBack}>{lang === "zh-CN" ? "返回" : "Back"}</Button> : <span />}
        <Button type="button" disabled={!canSubmit} onClick={onNext}>{lang === "zh-CN" ? "接受并完成" : "Accept and finish"}</Button>
      </div>
    </section>
  );
}
