import { useSuspenseQuery } from "@tanstack/react-query";
import { ProgressRing } from "@/components/ProgressRing";
import { parentProgressQuery } from "@/lib/parent-queries";
import { useParentLanguage } from "@/i18n/parent";
import type { CourseStage } from "@/mocks/types";
import { ParentPractice } from "./ParentPractice";

const chineseStages: Record<CourseStage, string> = { 1: "已学会音符", 2: "双手慢速合奏", 3: "达到速度", 4: "精心打磨", 5: "考试就绪" };
const chineseSections: Record<string, string> = { Repertoire: "曲目", "Technical work": "技巧练习", Musicianship: "音乐素养", Theory: "乐理" };
export function ParentProgress() {
  const { data } = useSuspenseQuery(parentProgressQuery);
  const { t, lang } = useParentLanguage();
  const chinese = lang === "zh-CN";
  return <div><h1 className="text-3xl font-semibold">{t("progress")}</h1>{data.map((child) => <section key={child.student.id} className="mt-6 border-t border-border py-6"><div className="flex flex-wrap items-center justify-between gap-5"><div><h2 className="text-2xl font-semibold">{child.student.firstName} {child.student.lastName}</h2><p className="mt-2">{child.course.framework === "Custom" ? chinese ? "个人课程" : "Personal course" : child.course.framework}</p></div><ProgressRing percent={child.course.readiness} readyLabel={t("ready")} ariaLabel={t("readiness")} /></div>
    {child.course.sections.map((section) => <section key={section.id} className="mt-6"><h3 className="border-b border-border pb-2 text-xl font-semibold">{chinese ? chineseSections[section.name] ?? section.name : section.name}</h3>{child.course.items.filter((item) => item.sectionId === section.id).map((item) => <div key={item.id} className="border-b border-border py-4"><h4 className="break-words text-lg font-semibold">{item.title}</h4>{item.composer && <p className="text-base text-muted-foreground">{item.composer}</p>}<p className="mt-2 text-base font-semibold text-success">{chinese ? chineseStages[item.stage] : child.course.stageNames[item.stage]}</p>{item.comment && <p className="mt-3 border-l-2 border-primary pl-3 text-base">{item.comment}</p>}</div>)}</section>)}
    <ParentPractice studentId={child.student.id} logs={child.practice} />
  </section>)}</div>;
}