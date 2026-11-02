import { families, students, weeklySlots } from "@/mocks/data";
import { parentGuardianId, parentPayments } from "@/mocks/parent";
import type { Message, PracticeLog } from "@/mocks/types";
import { PROTOTYPE_TODAY, addDays } from "@/lib/calendar";
import { respond } from "./_delay";
import { getDayLessons } from "./schedule";
import { getInvoices, setInvoiceStatus } from "./billing";
import { getRequirements, getStudentProgress, getPracticeLogs, addPractice } from "./curriculum";
import { getChatThread, getOrCreateFamilyConversation, sendMessage, markThreadRead } from "./chat";

export async function getParentSession() {
  const family = families.find((entry) => entry.guardians.some((guardian) => guardian.id === parentGuardianId));
  const guardian = family?.guardians.find((entry) => entry.id === parentGuardianId);
  if (!family || !guardian) throw new Error("Parent family not found");
  return respond({ family, guardian, children: students.filter((student) => student.familyId === family.id) });
}
export async function getParentInvoices() {
  const { family } = await getParentSession();
  return (await getInvoices()).filter((invoice) => invoice.familyId === family.id && !["draft", "void"].includes(invoice.status));
}
export async function getParentInvoice(id: string) { return (await getParentInvoices()).find((invoice) => invoice.id === id) ?? null; }
export async function getParentChat() {
  const { family } = await getParentSession();
  const conversation = await getOrCreateFamilyConversation(family.id);
  return getChatThread(conversation.id);
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
  return { ...session, nextLesson: nextLesson ?? null, unpaid: invoices.filter((invoice) => ["sent", "overdue", "partially_paid"].includes(invoice.status)), latestTeacher: latestTeacher ?? null };
}
export async function getParentProgress() {
  const { children } = await getParentSession();
  return Promise.all(children.map(async (student) => {
    const gradeGoal = weeklySlots.find((entry) => entry.studentId === student.id)?.gradeGoal ?? "AMEB Preliminary";
    const [requirements, progress, practice] = await Promise.all([getRequirements(gradeGoal.replace(/^AMEB /, "")), getStudentProgress(student.id), getPracticeLogs(student.id)]);
    return { student, gradeGoal, requirements, progress, practice };
  }));
}
export async function logParentPractice(input: Pick<PracticeLog, "studentId" | "date" | "minutes">) {
  const session = await getParentSession();
  if (!session.children.some((child) => child.id === input.studentId)) throw new Error("Child not in this family");
  if (!Number.isInteger(input.minutes) || input.minutes <= 0) throw new Error("Enter positive whole minutes");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date)) || input.date > PROTOTYPE_TODAY) throw new Error("Choose a valid practice date");
  return addPractice({ ...input, loggedBy: "student" });
}
export async function payParentInvoice(id: string, method: "payto" | "debit" | "card") {
  const invoice = await getParentInvoice(id);
  if (!invoice || !["sent", "overdue", "partially_paid"].includes(invoice.status)) throw new Error("Unpaid family invoice not found");
  if (!["payto", "debit", "card"].includes(method)) throw new Error("Payment method not found");
  parentPayments.push({ invoiceId: id, method });
  return setInvoiceStatus(id, "paid");
}