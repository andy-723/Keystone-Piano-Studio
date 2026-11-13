import { studioToday } from "@/lib/studio-clock";

/** Enrolment / age year: fixture year in demo, real studio year when live. */
export function enrolmentYear(): number {
  return Number(studioToday().slice(0, 4));
}

export function isAdultStudent(birthYear: number) {
  return Number.isInteger(birthYear) && birthYear >= 1900 && enrolmentYear() - birthYear >= 18;
}
