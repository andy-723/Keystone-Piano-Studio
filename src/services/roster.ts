import { families, lessonTypes, riskScores, students, studio, teacher, weeklySlots } from "@/mocks/data";
import type { Family, LessonType, RiskScore, Student, Studio, Teacher } from "@/mocks/types";
import { readStudioPlan } from "./plans";
import { respond } from "./_delay";
import { saveLiveStudioDetails, studioSnapshot } from "./live/studio-store";

export type StudentSummary = Student & { gradeGoal: string; durationMin: number; familyName: string; risk: RiskScore };

function summarise(s: Student): StudentSummary {
  return {
    ...s,
    gradeGoal: weeklySlots.find((w) => w.studentId === s.id)?.gradeGoal ?? s.gradeGoal ?? "",
    durationMin: lessonTypes.find((type) => type.id === weeklySlots.find((slot) => slot.studentId === s.id)?.lessonTypeId)?.durationMin ?? 30,
    familyName: families.find((f) => f.id === s.familyId)?.displayName ?? "",
    risk: riskScores.find((r) => r.studentId === s.id) ?? { studentId: s.id, score: 100, band: "green", reasons: [] },
  };
}

export const getStudio = (): Promise<Studio> => respond({ ...studio, plan: readStudioPlan() }, 0);
export const getTeacher = (): Promise<Teacher> => respond(teacher, 0);

export async function setGstRegistered(value: boolean): Promise<Studio> {
  const before = studioSnapshot();
  studio.gstRegistered = value;
  await saveLiveStudioDetails(before);
  return respond(studio);
}

export const getStudents = (): Promise<StudentSummary[]> =>
  respond([...students].sort((a, b) => a.firstName.localeCompare(b.firstName)).map(summarise));

export const getStudent = (id: string): Promise<StudentSummary | null> => {
  const s = students.find((x) => x.id === id);
  return respond(s ? summarise(s) : null);
};

export const getFamilies = (): Promise<Family[]> => respond(families);
export const getFamily = (id: string): Promise<Family | null> => respond(families.find((f) => f.id === id) ?? null);

export const getLessonPrices = (): Promise<LessonType[]> => respond(structuredClone(lessonTypes), 0);

/** Problem with a price list, or null. Lengths 10–240 min, one price per length, A$0–2,000. */
export function lessonPricesProblem(rows: Array<{ durationMin: number; priceCents: number }>): string | null {
  if (!rows.length) return "Add at least one lesson length.";
  if (rows.length > 12) return "Keep it to 12 lesson lengths or fewer.";
  for (const row of rows) {
    if (!Number.isInteger(row.durationMin) || row.durationMin < 10 || row.durationMin > 240)
      return "Lesson lengths must be 10 to 240 minutes.";
    if (!Number.isInteger(row.priceCents) || row.priceCents < 0 || row.priceCents > 200000)
      return "Prices must be between A$0 and A$2,000.";
  }
  if (new Set(rows.map((row) => row.durationMin)).size !== rows.length)
    return "Each lesson length can only have one price.";
  return null;
}

/** Saves the studio's lesson prices (one per lesson length). Bill next term uses them. */
export async function setLessonPrices(
  rows: Array<{ id?: string; durationMin: number; priceCents: number }>,
): Promise<LessonType[]> {
  const problem = lessonPricesProblem(rows);
  if (problem) throw new Error(problem);
  const before = studioSnapshot();
  const next: LessonType[] = [...rows]
    .sort((a, b) => a.durationMin - b.durationMin)
    .map((row) => {
      const existing = lessonTypes.find((type) => type.id === row.id) ??
        lessonTypes.find((type) => type.durationMin === row.durationMin);
      return {
        ...(existing ?? {}),
        id: existing?.id ?? `lt-${row.durationMin}`,
        name: `${row.durationMin} min lesson`,
        durationMin: row.durationMin,
        priceCents: row.priceCents,
      };
    });
  lessonTypes.splice(0, lessonTypes.length, ...next);
  await saveLiveStudioDetails(before);
  return getLessonPrices();
}
