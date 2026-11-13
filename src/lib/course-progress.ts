import type { CourseItem, CourseStage, Feedback, FrameworkSection } from "@/mocks/types";

/** Percent credit for one item: pieces 20% a stage; technical 0/50/100; checklists 0/100. */
export function itemPercent(item: Pick<CourseItem, "kind" | "stage" | "score">): number {
  if (item.kind === "technical") return item.score ?? 0;
  if (item.kind === "checklist") return item.score === 100 ? 100 : 0;
  return item.stage * 20;
}

/** Empty sections contribute zero until the teacher adds work; section weights are normalised. */
export function courseReadiness(sections: FrameworkSection[], items: CourseItem[]): number {
  const totalWeight = sections.reduce((sum, section) => sum + section.weightPct, 0);
  if (totalWeight <= 0) return 0;
  return Math.round(sections.reduce((sum, section) => {
    const group = items.filter((item) => item.sectionId === section.id);
    const average = group.length ? group.reduce((value, item) => value + itemPercent(item), 0) / group.length : 0;
    return sum + average * section.weightPct;
  }, 0) / totalWeight);
}

/** Per-section summary for families: items finished (100%) out of total, and the section's percent. */
export function sectionProgress(sections: FrameworkSection[], items: CourseItem[]) {
  return sections.map((section) => {
    const group = items.filter((item) => item.sectionId === section.id);
    const pct = group.length ? Math.round(group.reduce((value, item) => value + itemPercent(item), 0) / group.length) : 0;
    return { sectionId: section.id, done: group.filter((item) => itemPercent(item) === 100).length, total: group.length, pct };
  });
}

/** The newest checkpoint or score the teacher recorded on the course, if any. */
export function lastSignOff(feedback: Pick<Feedback, "createdAt" | "outcome">[]): string | undefined {
  return feedback.filter((entry) => entry.outcome !== "carry_over").map((entry) => entry.createdAt).sort().at(-1);
}

export function stageAfterFeedback(stage: CourseStage, outcome: Feedback["outcome"], newStage?: CourseStage): CourseStage {
  if (outcome === "stage_move") {
    if (!newStage || !Number.isInteger(newStage) || newStage < 1 || newStage > 5) throw new Error("Choose a stage from 1 to 5.");
    return newStage;
  }
  if (outcome === "pass") return Math.min(5, stage + 1) as CourseStage;
  return stage;
}

/** IDs are the three latest attended occurrences before this lesson, not calendar weeks. */
export function hasNoFeedbackInThreeLessons(itemIds: string[], lessonIds: string[], feedback: Feedback[]): boolean {
  const recent = lessonIds.slice(0, 3);
  return itemIds.length > 0 && recent.length === 3 && !feedback.some((entry) => itemIds.includes(entry.courseItemId) && entry.occurrenceId && recent.includes(entry.occurrenceId));
}

export function termLabel(key: string) {
  const match = key.match(/^(\d{4})-T([1-4])$/);
  return match ? `Term ${match[2]} ${match[1]}` : key;
}

/** The school term a date falls in, by quarter ("2026-T4" for November). */
export function currentTermKey(date: Date) {
  return `${date.getFullYear()}-T${Math.floor(date.getMonth() / 3) + 1}`;
}

/** The term `offset` terms after `key` ("2026-T4" + 1 = "2027-T1"). */
export function termAfterKey(key: string, offset: number) {
  const serial = Number(key.slice(0, 4)) * 4 + Number(key.slice(-1)) - 1 + offset;
  return `${Math.floor(serial / 4)}-T${(serial % 4) + 1}`;
}

/** Target-term choices: the selected term's year and the next, plus the selected term itself. */
export function termOptions(selected: string) {
  const year = Number(selected.slice(0, 4)) || new Date().getFullYear();
  const keys = [year, year + 1].flatMap((y) => [1, 2, 3, 4].map((t) => `${y}-T${t}`));
  return keys.includes(selected) ? keys : [selected, ...keys];
}
