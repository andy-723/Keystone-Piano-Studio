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
  studentName = "the student",
}: TermsScreenProps<EmergencyMedicalValue> & { lang?: Lang; studentName?: string }) {
  const title = lang === "zh-CN" ? "紧急医疗授权" : PART4_EMERGENCY_MEDICAL.title;
  const prompt =
    lang === "zh-CN"
      ? `若 ${studentName} 需要紧急医疗帮助且我们无法立刻联系到您或紧急联系人，我授权琴行呼叫救护车或寻求紧急医疗帮助，并向救治人员提供健康信息。救护车与医疗费用由我承担，但因琴行疏忽造成的除外。`
      : PART4_EMERGENCY_MEDICAL.prompt.replaceAll("{{student.firstName}}", studentName);
  const yes = lang === "zh-CN" ? "我同意" : PART4_EMERGENCY_MEDICAL.yes;
  const no = lang === "zh-CN" ? "我不同意" : PART4_EMERGENCY_MEDICAL.no;
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
