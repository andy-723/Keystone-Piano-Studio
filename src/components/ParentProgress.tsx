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
  return (
    <div>
      <h1 className="text-3xl font-semibold">{t("progress")}</h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        {chinese
          ? "每个曲目有五个练习阶段。圆环显示课程整体准备度，不是字母成绩。"
          : "Each piece moves through five practice stages. The ring shows overall course readiness — not a letter grade."}
      </p>
      {data.map((child) => (
        <section key={child.student.id} className="mt-6 border-t border-border py-6">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <h2 className="text-2xl font-semibold">
                {child.student.firstName} {child.student.lastName}
              </h2>
              <p className="mt-2">
                {child.course.framework === "Custom"
                  ? chinese
                    ? "个人课程"
                    : "Personal course"
                  : `${child.course.framework} · ${child.course.grade}`}
              </p>
            </div>
            <div className="space-y-2 text-center">
              <ProgressRing percent={child.course.readiness} readyLabel={t("ready")} ariaLabel={t("readiness")} />
              <p className="max-w-[11rem] text-sm text-muted-foreground">{chinese ? "阶段准备度" : "Stage readiness"}</p>
            </div>
          </div>
          {child.course.sections.map((section) => (
            <section key={section.id} className="mt-6">
              <h3 className="border-b border-border pb-2 text-xl font-semibold">
                {chinese ? chineseSections[section.name] ?? section.name : section.name}
              </h3>
              {child.course.items
                .filter((item) => item.sectionId === section.id)
                .map((item) => (
                  <div key={item.id} className="border-b border-border py-4">
                    <h4 className="break-words text-lg font-semibold">{item.title}</h4>
                    {item.composer && <p className="text-base text-muted-foreground">{item.composer}</p>}
                    <p className="mt-2 text-base font-semibold text-success">
                      {chinese
                        ? `第 ${item.stage} 阶段 · ${chineseStages[item.stage]}`
                        : `Stage ${item.stage} of 5 · ${child.course.stageNames[item.stage]}`}
                    </p>
                    {item.comment && <p className="mt-3 border-l-2 border-primary pl-3 text-base">{item.comment}</p>}
                  </div>
                ))}
            </section>
          ))}
          <ParentPractice studentId={child.student.id} logs={child.practice} />
        </section>
      ))}
    </div>
  );
}
