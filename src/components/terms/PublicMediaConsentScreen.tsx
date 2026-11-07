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
      ? "是否允许琴行在新闻通讯、布告栏或公开社交媒体中使用该学生的照片或短视频？作业用的私人课程录音是单独的选择。"
      : PART4_PUBLIC_MEDIA.prompt;
  const yes = lang === "zh-CN" ? "可以用于公开媒体" : PART4_PUBLIC_MEDIA.yes;
  const no = lang === "zh-CN" ? "不用于公开媒体" : PART4_PUBLIC_MEDIA.no;
  const talk = lang === "zh-CN" ? `请先与 ${studentName} 商量。` : PART4_PUBLIC_MEDIA.talkFirst.replace("{{student.firstName}}", studentName);
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
