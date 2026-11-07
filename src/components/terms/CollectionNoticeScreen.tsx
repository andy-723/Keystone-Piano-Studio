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
}: TermsScreenProps<CollectionNoticeValue> & { lang?: Lang; onOpenPrivacy?: () => void }) {
  const title = lang === "zh-CN" ? "在我们收集资料之前" : PART4_COLLECTION_NOTICE.title;
  const body =
    lang === "zh-CN"
      ? `您的琴行与 Keystone Music HQ 会收集报名、联系方式、课程安排，以及您选择提供的健康或学习备注，以便安全教学并管理账户。可能有有限支持访问的海外地区：${OVERSEAS_COUNTRIES_LABEL}。您可在条款步骤阅读琴行隐私政策。`
      : PART4_COLLECTION_NOTICE.body.replace("{{privacy.overseasCountriesLabel}}", OVERSEAS_COUNTRIES_LABEL);
  const privacy = lang === "zh-CN" ? "琴行隐私政策" : PART4_COLLECTION_NOTICE.privacyLinkLabel;
  const next = lang === "zh-CN" ? "继续" : "Continue";
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
