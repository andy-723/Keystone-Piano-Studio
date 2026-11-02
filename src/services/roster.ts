import { families, riskScores, students, studio, teacher, weeklySlots } from "@/mocks/data";
import type { Family, RiskScore, Student, Studio, Teacher } from "@/mocks/types";
import { respond } from "./_delay";

export type StudentSummary = Student & { gradeGoal: string; familyName: string; risk: RiskScore };

function summarise(s: Student): StudentSummary {
  return {
    ...s,
    gradeGoal: weeklySlots.find((w) => w.studentId === s.id)?.gradeGoal ?? "",
    familyName: families.find((f) => f.id === s.familyId)?.displayName ?? "",
    risk: riskScores.find((r) => r.studentId === s.id) ?? { studentId: s.id, score: 100, band: "green", reasons: [] },
  };
}

export const getStudio = (): Promise<Studio> => respond(studio, 0);
export const getTeacher = (): Promise<Teacher> => respond(teacher, 0);

export async function setGstRegistered(value: boolean): Promise<Studio> {
  studio.gstRegistered = value;
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
