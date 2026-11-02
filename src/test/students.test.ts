import { afterEach, describe, expect, it } from "vitest";
import { getStudents } from "@/services/roster";
import { filterStudents, fourWeekPractice } from "@/lib/student-insights";
import { getStudentAttendance, getStudentCheckInTemplate, getStudentProfile, openStudentCheckIn } from "@/services/students";
import { attendanceMarks, conversations, messages } from "@/mocks/data";
import { PROTOTYPE_TODAY } from "@/lib/calendar";

const savedConversations = conversations.map((entry) => ({ ...entry }));
afterEach(() => { attendanceMarks.delete("stu-6_2027-02-02"); conversations.splice(0, conversations.length, ...savedConversations.map((entry) => ({ ...entry }))); });

describe("Teacher Students", () => {
  it("filters to red and yellow students with red first and retains their reasons", async () => {
    const rows = filterStudents(await getStudents(), "", true);
    expect(rows).toHaveLength(8);
    expect(rows.map((student) => student.risk.band)).toEqual(["red", "red", "red", "yellow", "yellow", "yellow", "yellow", "yellow"]);
    expect(rows.every((student) => student.risk.reasons.length > 0)).toBe(true);
  });
  it("searches student name, family and grade without case sensitivity", async () => {
    const students = await getStudents();
    expect(filterStudents(students, " LUCY CHEN ", false).map((student) => student.id)).toEqual(["stu-1"]);
    expect(filterStudents(students, "Chen", false).map((student) => student.id).sort()).toEqual(["stu-1", "stu-2"]);
    expect(filterStudents(students, "AMEB Grade 3", false).every((student) => student.gradeGoal === "AMEB Grade 3")).toBe(true);
    expect(filterStudents(students, "no matching student", false)).toHaveLength(0);
  });
  it("charts exactly 28 days in four seven-day periods, separating teacher and student logs", () => {
    const weeks = fourWeekPractice([
      { id: "a", studentId: "stu-1", date: "2027-01-11", minutes: 20, loggedBy: "student" },
      { id: "b", studentId: "stu-1", date: "2027-02-07", minutes: 15, loggedBy: "teacher" },
      { id: "c", studentId: "stu-1", date: "2027-02-08", minutes: 100, loggedBy: "student" },
      { id: "d", studentId: "stu-1", date: "2027-01-10", minutes: 100, loggedBy: "student" },
    ], PROTOTYPE_TODAY);
    expect(weeks.map((week) => [week.start, week.end])).toEqual([["2027-01-11", "2027-01-17"], ["2027-01-18", "2027-01-24"], ["2027-01-25", "2027-01-31"], ["2027-02-01", "2027-02-07"]]);
    expect(weeks.map((week) => week.studentMinutes)).toEqual([20, 0, 0, 0]);
    expect(weeks.map((week) => week.teacherMinutes)).toEqual([0, 0, 0, 15]);
  });
  it("profiles scope invoices and guardians to the student family and calculate passed readiness", async () => {
    const profile = await getStudentProfile("stu-1");
    expect(profile?.family?.guardians[0]?.name).toBe("Wei Chen");
    expect(profile?.invoices.map((invoice) => invoice.id)).toEqual(["inv-1"]);
    const passed = profile?.requirements.filter((requirement) => profile.progress.some((progress) => progress.requirementId === requirement.id && progress.status === "passed")).length ?? 0;
    expect(profile?.readiness).toBe(Math.round(passed / (profile?.requirements.length ?? 1) * 100));
    expect(await getStudentProfile("missing")).toBeNull();
  });
  it("attendance skips term breaks and honours changes from Today", async () => {
    expect((await getStudentAttendance("stu-6")).map((lesson) => lesson.date)).toEqual(["2027-02-02"]);
    attendanceMarks.set("stu-6_2027-02-02", "attended");
    expect((await getStudentAttendance("stu-6"))[0]?.status).toBe("attended");
  });
  it("opens the red student's family thread without sending and returns an editable template", async () => {
    const count = messages.length;
    const conversation = await openStudentCheckIn("stu-6");
    const student = (await getStudents()).find((entry) => entry.id === "stu-6");
    expect(conversation.familyId).toBe(student?.familyId);
    expect(await getStudentCheckInTemplate("stu-6", conversation.id)).toContain(`${student?.firstName} is feeling about piano`);
    expect(messages).toHaveLength(count);
    await expect(getStudentCheckInTemplate("stu-6", "conv-1")).rejects.toThrow("this family");
    await expect(openStudentCheckIn("stu-1")).rejects.toThrow("unavailable");
  });
});