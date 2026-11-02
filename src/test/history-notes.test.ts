import { afterEach, describe, expect, it } from "vitest";
import { families, students, riskScores, weeklySlots, practiceLogs, conversations, messages, payments, invoices } from "@/mocks/data";
import { clientNotes } from "@/mocks/notes";
import { studentAttendance } from "@/mocks/student-attendance";
import { addDays, dayKind, PROTOTYPE_TODAY, TERMS_2027, weekday } from "@/lib/calendar";
import { addNote, updateNote, togglePin, deleteNote, getNotes, getRecentNotes } from "@/services/notes";
import { getParentChat, getParentHome, getParentSession, getParentSharedNotes } from "@/services/parent";
import { getInvoice, recordInvoicePayment } from "@/services/billing";

const originals = { notes: structuredClone(clientNotes), payments: structuredClone(payments), invoices: structuredClone(invoices) };
afterEach(() => { clientNotes.splice(0, clientNotes.length, ...structuredClone(originals.notes)); payments.splice(0, payments.length, ...structuredClone(originals.payments)); invoices.splice(0, invoices.length, ...structuredClone(originals.invoices)); });

describe("Realistic mock history", () => {
  it("uses Monday 15 March 2027 as today", () => { expect(PROTOTYPE_TODAY).toBe("2027-03-15"); expect(weekday(PROTOTYPE_TODAY)).toBe(1); });
  it("scores red 20–49, yellow 50–79 and green 80–100 as health", () => {
    for (const risk of riskScores) { const range = risk.band === "red" ? [20,49] : risk.band === "yellow" ? [50,79] : [80,100]; expect(risk.score).toBeGreaterThanOrEqual(range[0] ?? 0); expect(risk.score).toBeLessThanOrEqual(range[1] ?? 100); }
  });
  it("marks every past teaching occurrence and the two latest red lessons absent", () => {
    for (let date = "2027-01-28"; date < PROTOTYPE_TODAY; date = addDays(date, 1)) {
      if (dayKind(date).kind !== "teaching") continue;
      for (const slot of weeklySlots.filter((slot) => slot.weekday === weekday(date))) expect(studentAttendance.has(`${slot.studentId}_${date}`)).toBe(true);
    }
    for (const risk of riskScores.filter((risk) => risk.band === "red")) expect([...studentAttendance.entries()].filter(([id]) => id.startsWith(`${risk.studentId}_`)).slice(-2).map(([,status]) => status)).toEqual(["absent", "absent"]);
    expect([...studentAttendance.values()].filter((status) => status === "cancelled_late")).toHaveLength(3);
    expect([...studentAttendance.values()].filter((status) => status === "cancelled_by_studio")).toHaveLength(5);
  });
  it("seeds six second guardians and fictional teacher contacts", () => {
    expect(families.filter((family) => family.guardians.length === 2)).toHaveLength(6);
    expect(families.flatMap((family) => family.guardians).every((guardian) => /^04\d{2} \d{3} \d{3}$/.test(guardian.mobile ?? ""))).toBe(true);
  });
  it("seeds six exam dates in Term 2 or 3 and target terms for everyone else", () => {
    expect(students.filter((student) => student.examDate)).toHaveLength(6);
    expect(students.filter((student) => !student.examDate).every((student) => student.targetTerm)).toBe(true);
    expect(students.filter((student) => student.examDate).every((student) => TERMS_2027.slice(1,3).some((term) => (student.examDate ?? "") >= term.start && (student.examDate ?? "") <= term.end))).toBe(true);
  });
  it("seeds both practice authors and fifteen conversations of three to ten messages including three Chinese threads", () => {
    expect(new Set(practiceLogs.map((log) => log.loggedBy))).toEqual(new Set(["student", "teacher"]));
    expect(conversations).toHaveLength(15);
    for (const conversation of conversations) { const count = messages.filter((message) => message.conversationId === conversation.id).length; expect(count).toBeGreaterThanOrEqual(3); expect(count).toBeLessThanOrEqual(10); }
    expect(conversations.filter((conversation) => messages.some((message) => message.conversationId === conversation.id && /[\u4e00-\u9fff]/u.test(message.body)))).toHaveLength(3);
    expect(messages.some((message) => message.lessonSummary)).toBe(true);
  });
  it("paid invoices have records, partial invoices reconcile, overdue dates are fourteen to forty-five days old", async () => {
    for (const invoice of invoices) {
      const view = await getInvoice(invoice.id);
      if (invoice.status === "paid") { expect(view?.payments?.length).toBeGreaterThan(0); expect(view?.balanceCents).toBe(0); }
      if (invoice.status === "partially_paid") { expect(view?.paidCents).toBeGreaterThan(0); expect(view?.balanceCents).toBeGreaterThan(0); expect((view?.paidCents ?? 0) + (view?.balanceCents ?? 0)).toBe(invoice.totalCents); }
      if (invoice.status === "overdue") { const days = (Date.parse(PROTOTYPE_TODAY) - Date.parse(invoice.dueDate)) / 86400000; expect(days).toBeGreaterThanOrEqual(14); expect(days).toBeLessThanOrEqual(45); }
    }
    const partial = await getInvoice("inv-5");
    const paid = await recordInvoicePayment("inv-5", "debit");
    expect(paid.payments?.at(-1)?.amountCents).toBe(partial?.balanceCents);
    expect(paid.balanceCents).toBe(0);
    expect(paid.payments?.at(-1)?.method).toBe("debit");
  });
});

describe("Client notes and parent privacy", () => {
  it("seeds fifteen shared notes, private lesson notes and one to three family reminders", () => {
    expect(clientNotes.filter((note) => note.visibility === "shared")).toHaveLength(15);
    expect(clientNotes.filter((note) => note.lessonOccurrenceId && note.visibility === "private").length).toBeGreaterThan(60);
    for (const family of families) { const count = clientNotes.filter((note) => note.subjectType === "family" && note.subjectId === family.id).length; expect(count).toBeGreaterThanOrEqual(1); expect(count).toBeLessThanOrEqual(3); }
  });
  it("defaults private and supports read, update, pin and delete in memory", async () => {
    const note = await addNote({ subjectType: "student", subjectId: "stu-1", body: "New private reminder", category: "general" });
    expect(note.visibility).toBe("private"); expect(note.pinned).toBe(false);
    expect((await getNotes("student", "stu-1")).some((entry) => entry.id === note.id)).toBe(true);
    expect((await getRecentNotes(1))[0]?.id).toBe(note.id);
    expect(await updateNote(note.id, { body: "Updated reminder" })).toMatchObject({ body: "Updated reminder" });
    expect(await togglePin(note.id)).toMatchObject({ pinned: true });
    await deleteNote(note.id); expect((await getNotes("student", "stu-1")).some((entry) => entry.id === note.id)).toBe(false);
  });
  it("exposes only shared own-family notes and no guardian phones in any parent response", async () => {
    await addNote({ subjectType: "student", subjectId: "stu-1", body: "Never share this private note", category: "pastoral" });
    const shared = await getParentSharedNotes();
    expect(shared).toHaveLength(2);
    expect(shared.every((note) => note.visibility === "shared" && ["stu-1","stu-2","fam-1"].includes(note.subjectId))).toBe(true);
    const responses = await Promise.all([getParentSession(), getParentChat(), getParentHome()]);
    expect(JSON.stringify(responses)).not.toMatch(/mobile|0491|Never share this private note/);
  });
});