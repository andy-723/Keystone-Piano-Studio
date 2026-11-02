import { getStudent, getFamily, getStudents } from "./roster";
import { getCredits, getDayLessons } from "./schedule";
import { getPracticeLogs, getRequirements, getStudentProgress } from "./curriculum";
import { getInvoices } from "./billing";
import { getChatThread, getOrCreateFamilyConversation } from "./chat";
import { addDays, PROTOTYPE_TODAY } from "@/lib/calendar";
import { fourWeekPractice } from "@/lib/student-insights";
import { readiness } from "@/lib/lesson-progress";

export const getTeacherStudents = getStudents;

export async function getStudentAttendance(id: string) {
  const dates: string[] = [];
  for (let date = "2027-01-28"; date < PROTOTYPE_TODAY; date = addDays(date, 1)) dates.push(date);
  const plans = await Promise.all(dates.map(getDayLessons));
  return plans.flatMap((plan) => plan.lessons.filter((lesson) => lesson.studentId === id).map((lesson) => ({
    ...lesson, date: plan.date,
  }))).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

export async function getStudentProfile(id: string) {
  const student = await getStudent(id);
  if (!student) return null;
  const [family, attendance, logs, requirements, progress, invoices] = await Promise.all([
    getFamily(student.familyId), getStudentAttendance(id), getPracticeLogs(id),
    getRequirements(student.gradeGoal.replace(/^AMEB /, "")), getStudentProgress(id), getInvoices(),
  ]);
  return { student, family, attendance, practice: fourWeekPractice(logs, PROTOTYPE_TODAY), requirements, progress,
    credits: await getCredits(id), readiness: readiness(requirements, progress), invoices: invoices.filter((invoice) => invoice.familyId === student.familyId) };
}

export async function openStudentCheckIn(id: string) {
  const student = await getStudent(id);
  if (!student || student.risk.band !== "red") throw new Error("Student check-in unavailable");
  return getOrCreateFamilyConversation(student.familyId);
}

export async function getStudentCheckInTemplate(id: string, conversationId: string) {
  const [student, thread] = await Promise.all([getStudent(id), getChatThread(conversationId)]);
  if (!student || student.risk.band !== "red" || thread?.conversation.familyId !== student.familyId) throw new Error("Check-in does not belong to this family");
  const family = await getFamily(student.familyId);
  const greeting = family?.guardians.map((guardian) => guardian.name.split(" ")[0]).join(" and ") || "there";
  return `Hi ${greeting}, I wanted to check in and see how ${student.firstName} is feeling about piano at the moment. Is there anything I can do to help make lessons or practice a little easier? We can find a small, manageable goal together. Please let me know how things are going.\n\nWarmly,\nMs Clarke`;
}