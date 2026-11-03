import type { StudioPlan } from "@/mocks/types";

export function normalisePlan(value: unknown): StudioPlan {
  if (value === "solo" || value === "base") return "base";
  return value === "academy" ? "academy" : "pro";
}
export function baseStudentLimitExceeded(plan: StudioPlan, activeStudents: number) {
  return plan === "base" && activeStudents > 35;
}