import { Button } from "@/components/ui/button";
import { PART4_HEALTH_NOTES } from "@/mocks/legal-template-au";
import type { Lang } from "@/mocks/types";
import type { TermsScreenProps } from "./types";

export type HealthNotesConsentValue = { granted: boolean | null };

export function HealthNotesConsentScreen({
  value,
  onChange,
  onNext,
  onBack,
  lang = "en",
}: TermsScreenProps<HealthNotesConsentValue> & { lang?: Lang }) {
  const title = lang === "zh-CN" ? "健康与学习备注" : PART4_HEALTH_NOTES.title;
  const prompt =
    lang === "zh-CN"
      ? "您填写了医疗或学习备注。是否允许琴行将备注保存在学生档案中，并与授课老师分享以便备课？"
      : PART4_HEALTH_NOTES.prompt;
  const yes = lang === "zh-CN" ? "是，保存并与老师分享这些备注" : PART4_HEALTH_NOTES.yes;
  const no = lang === "zh-CN" ? "否，从报名中删除这些备注" : PART4_HEALTH_NOTES.no;
  return (
    <section className="space-y-5" aria-label={title}>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-base leading-relaxed">{prompt}</p>
      <div className="grid gap-3" role="group" aria-label={title}>
        <Button type="button" variant={value.granted === true ? "default" : "outline"} className="min-h-16 whitespace-normal" aria-pressed={value.granted === true} onClick={() => onChange({ granted: true })}>{yes}</Button>
        <Button type="button" variant={value.granted === false ? "default" : "outline"} className="min-h-16 whitespace-normal" aria-pressed={value.granted === false} onClick={() => onChange({ granted: false })}>{no}</Button>
      </div>
      <div className="flex flex-wrap justify-between gap-3">
        {onBack ? <Button type="button" variant="outline" onClick={onBack}>{lang === "zh-CN" ? "返回" : "Back"}</Button> : <span />}
        <Button type="button" disabled={value.granted === null} onClick={onNext}>{lang === "zh-CN" ? "继续" : "Continue"}</Button>
      </div>
    </section>
  );
}
