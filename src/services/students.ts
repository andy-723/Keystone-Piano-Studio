import { teacher as rosterTeacher, families as rosterFamilies, students as rosterStudents, weeklySlots as rosterSlots } from "@/mocks/data";
import { deleteLiveExampleFamily } from "./live/studio-store";
import { getStudent, getFamily, getStudents } from "./roster";
import { getCredits, getDayLessons } from "./schedule";
import { getPracticeLogs, getRequirements, getStudentProgress, getStudentCourse } from "./curriculum";
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
  const course = await getStudentCourse(id);
  return { student, family, attendance, practice: fourWeekPractice(logs, PROTOTYPE_TODAY), requirements, progress, course,
    credits: await getCredits(id), readiness: course.readiness, invoices: invoices.filter((invoice) => invoice.familyId === student.familyId) };
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
  return `Hi ${greeting}, I wanted to check in and see how ${student.firstName} is feeling about piano at the moment. Is there anything I can do to help make lessons or practice a little easier? We can find a small, manageable goal together. Please let me know how things are going.\n\nWarmly,\n${rosterTeacher.name || "Your teacher"}`;
}
/**
 * A new studio starts with one example family and student (0011). The owner can delete it; only
 * rows marked as the example can be deleted this way.
 */
export async function deleteExampleStudent(id: string) {
  const student = rosterStudents.find((entry) => entry.id === id);
  if (!student?.isExample) throw new Error("Only the example student can be deleted here.");
  const family = rosterFamilies.find((entry) => entry.id === student.familyId);
  if (!family?.isExample) throw new Error("Only the example student can be deleted here.");
  await deleteLiveExampleFamily(family.id);
  const removedIds = new Set(rosterStudents.filter((entry) => entry.familyId === family.id).map((entry) => entry.id));
  for (let i = rosterStudents.length - 1; i >= 0; i--) if (removedIds.has(rosterStudents[i]!.id)) rosterStudents.splice(i, 1);
  for (let i = rosterSlots.length - 1; i >= 0; i--) if (removedIds.has(rosterSlots[i]!.studentId)) rosterSlots.splice(i, 1);
  rosterFamilies.splice(rosterFamilies.indexOf(family), 1);
  return { deletedStudentIds: [...removedIds] };
}
