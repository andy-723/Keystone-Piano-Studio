import { practiceLogs, requirements, studentProgress } from "@/mocks/data";
import type { PracticeLog, Requirement, StudentProgress } from "@/mocks/types";
import { respond } from "./_delay";

export const getRequirements = (grade: string): Promise<Requirement[]> =>
  respond(requirements.filter((r) => r.grade === grade));

export const getStudentProgress = (studentId: string): Promise<StudentProgress[]> =>
  respond(studentProgress.filter((p) => p.studentId === studentId));

export async function setProgress(studentId: string, requirementId: string, status: StudentProgress["status"]) {
  const p = studentProgress.find((x) => x.studentId === studentId && x.requirementId === requirementId);
  if (p) p.status = status;
  else studentProgress.push({ studentId, requirementId, status });
  return respond(status, 60);
}

export const getPracticeLogs = (studentId: string): Promise<PracticeLog[]> =>
  respond(practiceLogs.filter((l) => l.studentId === studentId));

export async function addPractice(input: Omit<PracticeLog, "id">): Promise<PracticeLog> {
  const log = { ...input, id: `pl-${practiceLogs.length + 1}` };
  practiceLogs.push(log);
  return respond(log);
}
