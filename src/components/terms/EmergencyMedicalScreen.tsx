import { Button } from "@/components/ui/button";
import { PART4_EMERGENCY_MEDICAL } from "@/mocks/legal-template-au";
import type { Lang } from "@/mocks/types";
import type { TermsScreenProps } from "./types";

export type EmergencyMedicalValue = { granted: boolean | null };

export function EmergencyMedicalScreen({
  value,
  onChange,
  onNext,
  onBack,
  lang = "en",
}: TermsScreenProps<EmergencyMedicalValue> & { lang?: Lang }) {
  const title = lang === "zh-CN" ? "紧急医疗授权" : PART4_EMERGENCY_MEDICAL.title;
  const prompt =
    lang === "zh-CN"
      ? "若课程中出现医疗紧急情况，您是否授权琴行寻求紧急救助，并向急救人员提供相关健康信息？医疗费用由家庭承担，但因琴行疏忽造成的除外。"
      : PART4_EMERGENCY_MEDICAL.prompt;
  const yes = lang === "zh-CN" ? "是，我授权紧急救助并分享相关健康信息" : PART4_EMERGENCY_MEDICAL.yes;
  const no = lang === "zh-CN" ? "否，我不授权" : PART4_EMERGENCY_MEDICAL.no;
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
