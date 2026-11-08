import { Button } from "@/components/ui/button";
import { PART4_PUBLIC_MEDIA } from "@/mocks/legal-template-au";
import type { Lang } from "@/mocks/types";
import type { TermsScreenProps } from "./types";

export type PublicMediaConsentValue = { granted: boolean | null };

export function PublicMediaConsentScreen({
  value,
  onChange,
  onNext,
  onBack,
  lang = "en",
  studentName,
  studentAge,
}: TermsScreenProps<PublicMediaConsentValue> & { lang?: Lang; studentName: string; studentAge: number }) {
  const title = lang === "zh-CN" ? "公开媒体同意" : PART4_PUBLIC_MEDIA.title;
  const prompt =
    lang === "zh-CN"
      ? `是否允许琴行在网站、社交媒体或宣传材料中使用 ${studentName} 的照片、音频或视频？仅使用名，不使用姓或联系方式。课程反馈与考试录音不需要此同意。`
      : PART4_PUBLIC_MEDIA.prompt.replaceAll("{{student.firstName}}", studentName);
  const yes = lang === "zh-CN" ? "是，我同意" : PART4_PUBLIC_MEDIA.yes;
  const no = lang === "zh-CN" ? "否，我不同意" : PART4_PUBLIC_MEDIA.no;
  const talk = lang === "zh-CN" ? `请先与 ${studentName} 商量。我们发布前也会再征询他们。` : PART4_PUBLIC_MEDIA.talkFirst.replaceAll("{{student.firstName}}", studentName);
  return (
    <section className="space-y-5" aria-label={title}>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-base leading-relaxed">{prompt}</p>
      {studentAge >= 10 && <p className="border-l-4 border-primary pl-4 text-base">{talk}</p>}
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
