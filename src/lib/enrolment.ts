import { PROTOTYPE_TODAY } from '@/lib/calendar';

// Only a birth year is collected, so age is estimated against the fixture year.
export const enrolmentYear = Number(PROTOTYPE_TODAY.slice(0, 4));
export function isAdultStudent(birthYear: number) {
  return Number.isInteger(birthYear) && birthYear >= 1900 && enrolmentYear - birthYear >= 18;
}