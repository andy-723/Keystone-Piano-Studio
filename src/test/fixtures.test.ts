import { describe, expect, it } from "vitest";
import { conversations, families, invoices, messages, practiceLogs, requirements, riskScores, studentProgress, students, studio, teacher, weeklySlots } from "@/mocks/data";
import { addDays, PROTOTYPE_TODAY } from "@/lib/calendar";
import { getStudent, getStudents } from "@/services/roster";

describe("Opus project-knowledge fixtures", () => {
  it("provides Clarke Piano Studio, GST-registered, and one teacher", () => {
    expect(studio.name).toBe("Clarke Piano Studio");
    expect(studio.gstRegistered).toBe(true);
    expect(teacher.name).toBe("Ms Margaret Clarke");
  });
  it("provides 28 students in 22 families", () => {
    expect(students).toHaveLength(28);
    expect(families).toHaveLength(22);
    expect(students.every((student) => families.some((family) => family.id === student.familyId))).toBe(true);
  });
  it("provides a full teaching week for every student", () => {
    expect(weeklySlots).toHaveLength(28);
    expect(new Set(weeklySlots.map((slot) => slot.studentId)).size).toBe(28);
    expect([...new Set(weeklySlots.map((slot) => slot.weekday))]).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("provides invoices in every status", () => {
    expect([...new Set(invoices.map((invoice) => invoice.status))].sort()).toEqual(["draft", "overdue", "paid", "partially_paid", "sent", "void"]);
  });
  it("provides fifteen chat threads, three containing Chinese messages", () => {
    expect(conversations).toHaveLength(15);
    expect(conversations.filter((conversation) => messages.some((message) => message.conversationId === conversation.id && /[\u4e00-\u9fff]/u.test(message.body)))).toHaveLength(3);
  });
  it("provides AMEB requirements from Preliminary to Grade 4", () => {
    expect([...new Set(requirements.map((requirement) => requirement.grade))]).toEqual(["Preliminary", "Grade 1", "Grade 2", "Grade 3", "Grade 4"]);
    expect(requirements.every((requirement) => requirement.framework === "AMEB")).toBe(true);
    expect(students.every((student) => studentProgress.some((entry) => entry.studentId === student.id))).toBe(true);
  });
  it("provides four weeks of practice logs", () => {
    expect([...new Set(practiceLogs.map((log) => log.date))].sort()).toEqual(Array.from({ length: 46 }, (_, index) => addDays(PROTOTYPE_TODAY, -index - 1)).sort());
  });
  it("provides at least three red risk students", () => {
    expect(riskScores.filter((risk) => risk.band === "red").length).toBeGreaterThanOrEqual(3);
  });
  it("provides at least five yellow risk students", () => {
    expect(riskScores.filter((risk) => risk.band === "yellow").length).toBeGreaterThanOrEqual(5);
  });
  it("reads the student roster and individual students through async services", async () => {
    expect(await getStudents()).toHaveLength(28);
    expect(await getStudent("stu-1")).toMatchObject({ firstName: "Lucy", lastName: "Chen" });
    expect(await getStudent("missing")).toBeNull();
  });
});