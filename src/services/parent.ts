import { families, students, weeklySlots } from "@/mocks/data";
import { parentGuardianId, parentPayments } from "@/mocks/parent";
import type { Message, PracticeLog, Guardian } from "@/mocks/types";
import { PROTOTYPE_TODAY, addDays } from "@/lib/calendar";
import { respond } from "./_delay";
import { getCredits, getDayLessons } from "./schedule";
import { getInvoices, recordInvoicePayment } from "./billing";
import { getRequirements, getStudentProgress, getPracticeLogs, addPractice, getStudentCourse } from "./curriculum";
import { getChatThread, getOrCreateFamilyConversation, sendMessage, markThreadRead } from "./chat";
import { parentMakeUpRequests } from "@/mocks/scheduling";
import { getNotes } from "./notes";
import { getStripeStatus } from "./integrations";

function parentGuardian(guardian: Guardian) { return { id: guardian.id, name: guardian.name, email: guardian.email, preferredLanguage: guardian.preferredLanguage }; }

export async function getParentSession() {
  const family = families.find((entry) => entry.guardians.some((guardian) => guardian.id === parentGuardianId));
  const guardian = family?.guardians.find((entry) => entry.id === parentGuardianId);
  if (!family || !guardian) throw new Error("Parent family not found");
  return respond({ family: { ...family, guardians: family.guardians.map(parentGuardian) }, guardian: parentGuardian(guardian), children: students.filter((student) => student.familyId === family.id) });
}
export async function getParentInvoices() {
  const { family } = await getParentSession();
  return (await getInvoices()).filter((invoice) => invoice.familyId === family.id && !["draft", "void"].includes(invoice.status));
}
export async function getParentInvoice(id: string) { return (await getParentInvoices()).find((invoice) => invoice.id === id) ?? null; }
export async function getParentChat() {
  const { family } = await getParentSession();
  const conversation = await getOrCreateFamilyConversation(family.id);
  const thread = await getChatThread(conversation.id);
  return thread ? { ...thread, family } : null;
}
export async function readParentChat() {
  const thread = await getParentChat();
  if (!thread) return null;
  await markThreadRead(thread.conversation.id, "guardian");
  return getParentChat();
}
export async function sendParentMessage(input: Pick<Message, "body" | "kind" | "media">) {
  const [{ guardian }, thread] = await Promise.all([getParentSession(), getParentChat()]);
  if (!thread) throw new Error("Family chat not found");
  return sendMessage({ ...input, conversationId: thread.conversation.id, authorName: guardian.name, authorRole: "guardian" });
}
export async function getParentHome() {
  const [session, invoices, thread] = await Promise.all([getParentSession(), getParentInvoices(), getParentChat()]);
  let nextLesson: Awaited<ReturnType<typeof getDayLessons>>["lessons"][number] | undefined;
  for (let offset = 0; offset < 365 && !nextLesson; offset++) {
    const day = await getDayLessons(addDays(PROTOTYPE_TODAY, offset));
    nextLesson = day.lessons.find((lesson) => lesson.student.familyId === session.family.id && lesson.status === "scheduled");
  }
  const latestTeacher = thread?.messages.filter((message) => message.authorRole === "teacher").at(-1);
  return { ...session, nextLesson: nextLesson ?? null, unpaid: invoices.filter((invoice) => ["sent", "overdue", "partially_paid"].includes(invoice.status)), latestTeacher: latestTeacher ?? null, makeUps: await Promise.all(session.children.map(async (child) => ({ studentId: child.id, name: child.firstName, ...await getCredits(child.id) }))), sharedNotes: await getParentSharedNotes() };
}
export async function getParentSharedNotes() {
  const { family, children } = await getParentSession();
  const groups = await Promise.all([getNotes("family", family.id), ...children.map((child) => getNotes("student", child.id))]);
  return groups.flat().filter((note) => note.visibility === "shared").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export async function getParentProgress() {
  const { children } = await getParentSession();
  return Promise.all(children.map(async (student) => {
    const gradeGoal = weeklySlots.find((entry) => entry.studentId === student.id)?.gradeGoal ?? "AMEB Preliminary";
    const [requirements, progress, practice] = await Promise.all([getRequirements(gradeGoal.replace(/^AMEB /, "")), getStudentProgress(student.id), getPracticeLogs(student.id)]);
    const course = await getStudentCourse(student.id);
    return { student, gradeGoal, requirements, progress, practice, course: { framework: course.course.framework, grade: course.course.grade, readiness: course.readiness, stageNames: course.stageNames, sections: course.sections.map((section) => ({ id: section.id, name: section.name })), items: course.items.map((item) => {
      const latest = course.feedback.filter((entry) => entry.courseItemId === item.id && entry.shared && entry.comment).at(-1);
      return { id: item.id, sectionId: item.sectionId, title: item.title, composer: item.composer, stage: item.stage, comment: latest?.comment };
    }) } };
  }));
}
export async function logParentPractice(input: Pick<PracticeLog, "studentId" | "date" | "minutes">) {
  const session = await getParentSession();
  if (!session.children.some((child) => child.id === input.studentId)) throw new Error("Child not in this family");
  if (!Number.isInteger(input.minutes) || input.minutes <= 0) throw new Error("Enter positive whole minutes");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date)) || input.date > PROTOTYPE_TODAY) throw new Error("Choose a valid practice date");
  return addPractice({ ...input, loggedBy: "student" });
}
export async function payParentInvoice(id: string, method: "payto" | "becs" | "card") {
  const invoice = await getParentInvoice(id);
  if (!invoice || !["sent", "overdue", "partially_paid"].includes(invoice.status)) throw new Error("Unpaid family invoice not found");
  if (await getStripeStatus() !== "connected") throw new Error("Your teacher will send bank details");
  if (!["payto", "becs", "card"].includes(method)) throw new Error("Payment method not found");
  parentPayments.push({ invoiceId: id, method });
  return recordInvoicePayment(id, method);
}
export async function requestParentMakeUp(studentId: string, lang: "en" | "zh-CN") {
  const { children } = await getParentSession(); const child = children.find((entry) => entry.id === studentId);
  if (!child) throw new Error("Child not in this family");
  const credits = await getCredits(studentId); if (credits.balance < 1) throw new Error("No make-up credit available");
  if (parentMakeUpRequests.has(studentId)) return respond({ requested: true });
  parentMakeUpRequests.add(studentId);
  try { await sendParentMessage({ kind: "text", body: lang === "zh-CN" ? `请为${child.firstName}安排一节补课。请老师告知可用时间，谢谢。` : `Could you please book a make-up lesson for ${child.firstName}? Please let us know a suitable free time. Thank you.` }); }
  catch (error) { parentMakeUpRequests.delete(studentId); throw error; }
  return respond({ requested: true });
}
