import type { StudioPlan } from "@/mocks/types";

import { BASE_STUDENT_CAP } from "@/lib/subscription";

/** Same cap as the database trigger (0017) and src/lib/subscription.ts. */
export const BASE_STUDENT_LIMIT = BASE_STUDENT_CAP;
export const PUBLIC_PLANS = [
  { id: "base", name: "Base", monthlyCents: 2900, gstInclusiveCents: 3190, studentLimit: BASE_STUDENT_LIMIT },
  { id: "pro", name: "Pro", monthlyCents: 4900, gstInclusiveCents: 5390, studentLimit: null },
] as const;

export function normalisePlan(value: unknown): StudioPlan {
  if (value === "solo" || value === "base") return "base";
  return value === "academy" ? "academy" : "pro";
}
export function baseStudentLimitExceeded(plan: StudioPlan, activeStudents: number) {
  return plan === "base" && activeStudents > BASE_STUDENT_LIMIT;
}