import { useSuspenseQuery } from "@tanstack/react-query";
import { ProgressRing } from "@/components/ProgressRing";
import { parentProgressQuery } from "@/lib/parent-queries";
import { useParentLanguage } from "@/i18n/parent";
import { termLabel } from "@/lib/course-progress";
import { PILLARS } from "@/lib/benchmarks";
import type { CourseStage } from "@/mocks/types";
import { ParentPractice } from "./ParentPractice";

type Lang = "en" | "zh" | "vi";
const chineseStages: Record<CourseStage, string> = { 1: "已学会音符和指法", 2: "双手合奏、节奏准确", 3: "达到目标速度、流畅不停", 4: "力度、奏法与踏板", 5: "可以演出" };
const vietStages: Record<CourseStage, string> = { 1: "Thuộc nốt và ngón", 2: "Hai tay, đúng nhịp", 3: "Đạt tốc độ, liền mạch", 4: "Sắc thái, kỹ thuật và pedal", 5: "Sẵn sàng biểu diễn" };
const vietSections: Record<string, string> = { Repertoire: "Bản nhạc", "Technical work": "Kỹ thuật", Musicianship: "Nhạc cảm", Theory: "Nhạc lý", "Theory and reading": "Nhạc lý và đọc nhạc", "Ear, sight-reading and pedal": "Nghe, thị tấu và pedal" };
const chineseSections: Record<string, string> = { Repertoire: "曲目", "Technical work": "技巧练习", Musicianship: "音乐素养", Theory: "乐理", "Theory and reading": "乐理与识谱", "Ear, sight-reading and pedal": "听力、视奏与踏板" };
const SCORE: Record<Lang, Record<"technical" | "checklist", Record<number, string>>> = {
  en: { technical: { 0: "Not started", 50: "In progress", 100: "Mastered at tempo" }, checklist: { 0: "Not yet", 100: "Done" } },
  zh: { technical: { 0: "未开始", 50: "练习中", 100: "已按速度掌握" }, checklist: { 0: "尚未", 100: "已完成" } },
  vi: { technical: { 0: "Chưa bắt đầu", 50: "Đang luyện", 100: "Thành thạo đúng tốc độ" }, checklist: { 0: "Chưa", 100: "Xong" } },
};
const COPY: Record<Lang, { intro: string; personal: string; ready: string; goal: (grade: string, term: string) => string; done: (done: number, total: number) => string; benchmark: (level: string) => string; benchmarkNote: string; practice: (min: number, max: number) => string }> = {
  en: {
    intro: "Pieces move through five stages, scales are in progress or mastered, and theory and ear skills are ticked off. The ring is a guide from your teacher's sign-offs, not a letter grade or exam result.",
    personal: "Personal course",
    ready: "Level readiness",
    goal: (grade, term) => `Goal: ${grade} by ${term}`,
    done: (done, total) => `${done} of ${total} done`,
    benchmark: (level) => `What ${level} usually looks like`,
    benchmarkNote: "The Keystone benchmark is a general guide, not an exam board syllabus. Your teacher sets the pieces and pace.",
    practice: (min, max) => `Suggested practice: ${min === max ? min : `${min}–${max}`} minutes a day`,
  },
  zh: {
    intro: "曲目分五个阶段，音阶分为练习中或已掌握，乐理和听力项目逐项完成。圆环是老师签核的参考，不是字母成绩或考试结果。",
    personal: "个人课程",
    ready: "级别准备度",
    goal: (grade, term) => `目标：${term}前完成 ${grade}`,
    done: (done, total) => `已完成 ${done}/${total}`,
    benchmark: (level) => `${level} 通常的样子`,
    benchmarkNote: "Keystone 基准是通用指南（英文），不是考试机构的大纲。曲目和进度由老师决定。",
    practice: (min, max) => `建议每天练习 ${min === max ? min : `${min}–${max}`} 分钟`,
  },
  vi: {
    intro: "Bản nhạc đi qua năm giai đoạn, gam đang luyện hoặc đã thành thạo, nhạc lý và kỹ năng nghe được đánh dấu khi xong. Vòng tròn là hướng dẫn từ xác nhận của giáo viên, không phải điểm chữ hay kết quả thi.",
    personal: "Khóa học riêng",
    ready: "Mức sẵn sàng của cấp độ",
    goal: (grade, term) => `Mục tiêu: ${grade} trước ${term}`,
    done: (done, total) => `Xong ${done}/${total}`,
    benchmark: (level) => `${level} thường trông như thế nào`,
    benchmarkNote: "Chuẩn Keystone là hướng dẫn chung (tiếng Anh), không phải đề cương của hội đồng thi. Giáo viên chọn bài và tốc độ.",
    practice: (min, max) => `Gợi ý luyện tập: ${min === max ? min : `${min}–${max}`} phút mỗi ngày`,
  },
};

export function ParentProgress() {
  const { data } = useSuspenseQuery(parentProgressQuery);
  const { t, lang: parentLang } = useParentLanguage();
  const lang: Lang = parentLang === "zh-CN" ? "zh" : parentLang === "vi" ? "vi" : "en";
  const copy = COPY[lang];
  const sectionName = (name: string) => (lang === "zh" ? chineseSections[name] ?? name : lang === "vi" ? vietSections[name] ?? name : name);
  return (
    <div>
      <h1 className="text-3xl font-semibold">{t("progress")}</h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">{copy.intro}</p>
      {data.map((child) => (
        <section key={child.student.id} className="mt-6 border-t border-border py-6">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <h2 className="text-2xl font-semibold">
                {child.student.firstName} {child.student.lastName}
              </h2>
              <p className="mt-2">{child.course.framework === "Custom" && !child.course.benchmark ? copy.personal : `${child.course.framework === "Custom" ? "" : `${child.course.framework} · `}${child.course.grade}`}</p>
              {child.course.benchmark && <p className="mt-1 font-semibold">{copy.goal(child.course.grade, termLabel(child.course.targetTerm))}</p>}
            </div>
            <div className="space-y-2 text-center">
              <ProgressRing percent={child.course.readiness} readyLabel={t("ready")} ariaLabel={t("readiness")} />
              <p className="max-w-[11rem] text-sm text-muted-foreground">{copy.ready}</p>
            </div>
          </div>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Progress by area">
            {child.course.sections.map((section) => (
              <li key={section.id}>
                <div className="flex justify-between gap-2 text-base">
                  <span className="font-semibold">{sectionName(section.name)}</span>
                  <span className="text-muted-foreground">{section.total ? copy.done(section.done, section.total) : "—"}</span>
                </div>
                <div className="mt-1 h-2 rounded-sm bg-border" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={section.pct} aria-label={`${sectionName(section.name)} ${section.pct}%`}>
                  <div className="h-full rounded-sm bg-success" style={{ width: `${section.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {child.course.sections.map((section) => (
            <section key={section.id} className="mt-6">
              <h3 className="border-b border-border pb-2 text-xl font-semibold">{sectionName(section.name)}</h3>
              {child.course.items
                .filter((item) => item.sectionId === section.id)
                .map((item) => (
                  <div key={item.id} className="border-b border-border py-4">
                    <h4 className="break-words text-lg font-semibold">{item.title}</h4>
                    {item.composer && <p className="text-base text-muted-foreground">{item.composer}</p>}
                    <p className={`mt-2 text-base font-semibold ${item.kind !== "piece" && item.checkPct !== 100 ? "text-muted-foreground" : "text-success"}`}>
                      {item.kind !== "piece"
                        ? SCORE[lang][item.kind][item.checkPct]
                        : lang === "zh"
                          ? `第 ${item.stage} 阶段 · ${chineseStages[item.stage]}`
                          : lang === "vi"
                            ? `Giai đoạn ${item.stage}/5 · ${vietStages[item.stage]}`
                            : `Stage ${item.stage} of 5 · ${child.course.stageNames[item.stage]}`}
                    </p>
                    {item.comment && <p className="mt-3 border-l-2 border-primary pl-3 text-base">{item.comment}</p>}
                  </div>
                ))}
            </section>
          ))}
          {child.course.benchmark && (
            <details className="mt-6 rounded-md border border-border p-4">
              <summary className="cursor-pointer text-lg font-semibold">{copy.benchmark(child.course.benchmark.label)}</summary>
              <p className="mt-3 text-base text-muted-foreground">{copy.benchmarkNote}</p>
              <dl className="mt-3 space-y-3 text-base">
                {PILLARS.map((pillar) => (
                  <div key={pillar.id}>
                    <dt className="font-semibold">{sectionName(pillar.name)}</dt>
                    <dd>{child.course.benchmark!.pillars[pillar.id].summary}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-base text-muted-foreground">{copy.practice(...child.course.benchmark.practiceMinPerDay)}</p>
            </details>
          )}
          <ParentPractice studentId={child.student.id} logs={child.practice} />
        </section>
      ))}
    </div>
  );
}
