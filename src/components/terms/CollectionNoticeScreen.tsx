import { Button } from "@/components/ui/button";
import { PART4_COLLECTION_NOTICE } from "@/mocks/legal-template-au";
import { OVERSEAS_COUNTRIES_LABEL } from "@/mocks/keystone-suppliers";
import type { Lang } from "@/mocks/types";
import type { TermsScreenProps } from "./types";

export type CollectionNoticeValue = { acknowledged: boolean };

export function CollectionNoticeScreen({
  value,
  onChange,
  onNext,
  onBack,
  lang = "en",
  onOpenPrivacy,
  studioName = "the Studio",
  studentName = "the student",
}: TermsScreenProps<CollectionNoticeValue> & {
  lang?: Lang;
  onOpenPrivacy?: () => void;
  studioName?: string;
  studentName?: string;
}) {
  const title = lang === "zh-CN" ? "收集说明" : PART4_COLLECTION_NOTICE.title;
  const body =
    lang === "zh-CN"
      ? `${studioName} 会收集这些页面上的资料，以便为 ${studentName} 报名、教学、账单与安全保障。资料保存在 Keystone Music HQ。部分服务提供商在海外：${OVERSEAS_COUNTRIES_LABEL}。若不提供必填资料，将无法完成报名。`
      : PART4_COLLECTION_NOTICE.body
          .replaceAll("{{studio.tradingName}}", studioName)
          .replaceAll("{{student.firstName}}", studentName)
          .replaceAll("{{privacy.overseasCountriesLabel}}", OVERSEAS_COUNTRIES_LABEL);
  const privacy = lang === "zh-CN" ? "阅读隐私政策" : PART4_COLLECTION_NOTICE.privacyLinkLabel;  const next = lang === "zh-CN" ? "继续" : "Continue";
  const back = lang === "zh-CN" ? "返回" : "Back";
  const ack = lang === "zh-CN" ? "我已阅读此收集说明" : "I have read this collection notice";
  return (
    <section className="space-y-5" aria-label={title}>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-base leading-relaxed">{body}</p>
      {onOpenPrivacy && (
        <Button type="button" variant="link" className="min-h-12 px-0" onClick={onOpenPrivacy}>
          {privacy}
        </Button>
      )}
      <label className="flex min-h-12 cursor-pointer items-center gap-3">
        <input className="size-6 shrink-0 accent-primary" type="checkbox" checked={value.acknowledged} onChange={(event) => onChange({ acknowledged: event.target.checked })} />
        {ack}
      </label>
      <div className="flex flex-wrap justify-between gap-3">
        {onBack ? <Button type="button" variant="outline" onClick={onBack}>{back}</Button> : <span />}
        <Button type="button" disabled={!value.acknowledged} onClick={onNext}>{next}</Button>
      </div>
    </section>
  );
}
