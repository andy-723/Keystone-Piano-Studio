import { afterEach, expect, it } from "vitest";
import { invoices, messages, conversations, practiceLogs, payments } from "@/mocks/data";
import { getParentSession, getParentHome, getParentInvoices, getParentInvoice, getParentProgress, logParentPractice, sendParentMessage, readParentChat, payParentInvoice } from "@/services/parent";
import { sendMessage } from "@/services/chat";
import { parentPayments } from "@/mocks/parent";
const original = { payments: structuredClone(payments), invoices: structuredClone(invoices), messages: structuredClone(messages), conversations: structuredClone(conversations), practice: structuredClone(practiceLogs) };
afterEach(() => { payments.splice(0, payments.length, ...structuredClone(original.payments)); invoices.splice(0, invoices.length, ...structuredClone(original.invoices)); messages.splice(0, messages.length, ...structuredClone(original.messages)); conversations.splice(0, conversations.length, ...structuredClone(original.conversations)); practiceLogs.splice(0, practiceLogs.length, ...structuredClone(original.practice)); parentPayments.length = 0; });
it("defaults Wei Chen to Chinese and exposes only Lucy and Oscar without risk fields", async () => {
  const session = await getParentSession();
  expect(session.guardian).toMatchObject({ id: "g-1", name: "Wei Chen", preferredLanguage: "zh-CN" });
  expect(session.children.map((child) => child.id)).toEqual(["stu-1", "stu-2"]);
  const progress = await getParentProgress();
  expect(progress).toHaveLength(2);
  expect(JSON.stringify(progress)).not.toMatch(/risk|band|score/i);
  const home = await getParentHome();
  expect(home.nextLesson).toMatchObject({ studentId: "stu-1", startsAt: "2027-03-15T15:30:00+11:00" });
});
it("only exposes this family's issued invoices", async () => {
  expect((await getParentInvoices()).map((invoice) => invoice.id)).toEqual(["inv-1"]);
  expect(await getParentInvoice("inv-4")).toBeNull();
});
it("logs family practice as student and rejects another family's child", async () => {
  expect(await logParentPractice({ studentId: "stu-2", date: "2027-02-08", minutes: 15 })).toMatchObject({ loggedBy: "student", minutes: 15, studentId: "stu-2" });
  await expect(logParentPractice({ studentId: "stu-3", date: "2027-02-08", minutes: 15 })).rejects.toThrow("Child not in this family");
});
it("sends parent chat as Wei Chen in the Chen thread", async () => {
  expect(await sendParentMessage({ body: "Thanks for today's lesson", kind: "text" })).toMatchObject({ conversationId: "conv-1", authorName: "Wei Chen", authorRole: "guardian" });
});
it("parent reading marks teacher messages read without clearing the teacher's unread badge", async () => {
  const teacher = await sendMessage({ conversationId: "conv-1", authorName: "Ms Clarke", authorRole: "teacher", body: "Well done", kind: "text" });
  await readParentChat();
  expect(messages.find((message) => message.id === teacher.id)?.readAt).toBeTruthy();
  expect(conversations.find((thread) => thread.id === "conv-1")?.unreadCount).toBe(1);
  expect(conversations.find((thread) => thread.id === "conv-2")?.unreadCount).toBe(1);
});
it.each(["payto", "debit", "card"] as const)("simulates %s only for an unpaid family invoice", async (method) => {
  const invoice = invoices.find((entry) => entry.id === "inv-1");
  if (!invoice) throw new Error("Missing fixture");
  invoice.status = "sent";
  expect(await payParentInvoice("inv-1", method)).toMatchObject({ status: "paid" });
  expect(parentPayments).toEqual([{ invoiceId: "inv-1", method }]);
  await expect(payParentInvoice("inv-4", method)).rejects.toThrow("Unpaid family invoice not found");
});