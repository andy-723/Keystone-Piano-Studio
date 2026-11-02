import { afterEach, describe, expect, it } from "vitest";
import { readiness, weekPractice } from "@/lib/lesson-progress";
import { requirements, studentProgress, practiceLogs, messages, conversations } from "@/mocks/data";
import { lessonNotes } from "@/mocks/lessons";
import { getLiveLesson, finishLesson, saveLessonNotes } from "@/services/lessons";
import { addPractice, getPracticeLogs, getStudentProgress, setProgress } from "@/services/curriculum";
import { getMessages } from "@/services/chat";
import type { PracticeLog } from "@/mocks/types";

const originals = { progress: structuredClone(studentProgress), logs: structuredClone(practiceLogs), messages: structuredClone(messages), conversations: structuredClone(conversations) };
afterEach(() => {
  studentProgress.splice(0, studentProgress.length, ...structuredClone(originals.progress));
  practiceLogs.splice(0, practiceLogs.length, ...structuredClone(originals.logs));
  messages.splice(0, messages.length, ...structuredClone(originals.messages));
  conversations.splice(0, conversations.length, ...structuredClone(originals.conversations));
  lessonNotes.clear();
});

describe("Live Lesson rules", () => {
  it("calculates 55% readiness from six passed requirements out of eleven, ignoring unrelated progress", () => {
    const grade = requirements.filter((entry) => entry.grade === "Grade 3");
    expect(grade).toHaveLength(11);
    const progress = grade.map((entry, index) => ({ studentId: "stu-1", requirementId: entry.id, status: index < 6 ? "passed" as const : "learning" as const }));
    progress.push({ studentId: "stu-1", requirementId: "other-grade", status: "passed" });
    expect(readiness(grade, progress)).toBe(55);
    expect(readiness([], progress)).toBe(0);
  });
  it.each(["not_started", "learning", "passed"] as const)("saves a requirement as %s", async (status) => {
    const requirement = requirements.find((entry) => entry.grade === "Grade 3");
    if (!requirement) throw new Error("Missing Grade 3 fixture");
    await setProgress("stu-1", requirement.id, status);
    expect((await getStudentProgress("stu-1")).find((entry) => entry.requirementId === requirement.id)?.status).toBe(status);
  });
  it("counts Monday–Sunday student practice separately from teacher minutes", () => {
    const log = (date: string, minutes: number, loggedBy: PracticeLog["loggedBy"]): PracticeLog => ({ id: date + loggedBy, studentId: "stu-1", date, minutes, loggedBy });
    const logs = [log("2027-02-07", 100, "student"), log("2027-02-08", 20, "student"), log("2027-02-14", 30, "student"), log("2027-02-15", 100, "student"), log("2027-02-10", 15, "teacher")];
    expect(weekPractice(logs, "2027-02-08")).toEqual({ student: 50, teacher: 15 });
    expect(weekPractice(logs, "2027-02-14")).toEqual({ student: 50, teacher: 15 });
  });
  it("stores added practice with loggedBy teacher and the lesson date", async () => {
    await addPractice({ studentId: "stu-1", date: "2027-02-08", minutes: 15, loggedBy: "teacher" });
    expect((await getPracticeLogs("stu-1")).at(-1)).toMatchObject({ minutes: 15, loggedBy: "teacher", date: "2027-02-08" });
  });
  it("retains lesson notes and a simulated ten-second clip in mock state", async () => {
    await saveLessonNotes("stu-1_2027-02-08", { notes: "Work on even scale tempo.", voiceSeconds: 10 });
    expect((await getLiveLesson("stu-1_2027-02-08"))?.draft).toEqual({ notes: "Work on even scale tempo.", voiceSeconds: 10 });
  });
  it("posts one summary to the existing family thread, including notes and practice, even on repeated finish", async () => {
    await saveLessonNotes("stu-1_2027-02-08", { notes: "Keep wrists relaxed.", voiceSeconds: 10 });
    await addPractice({ studentId: "stu-1", date: "2027-02-08", minutes: 15, loggedBy: "teacher" });
    const before = messages.length;
    const [first, second] = await Promise.all([finishLesson("stu-1_2027-02-08"), finishLesson("stu-1_2027-02-08")]);
    expect(first.id).toBe(second.id);
    expect((await finishLesson("stu-1_2027-02-08")).id).toBe(first.id);
    expect(messages.length).toBe(before + 1);
    expect(first.conversationId).toBe("conv-1");
    expect(first.authorRole).toBe("teacher");
    expect(first.lessonSummary).toMatchObject({ lessonId: "stu-1_2027-02-08", studentName: "Lucy Chen", date: "2027-02-08" });
    expect(first.body).toContain("Keep wrists relaxed.");
    expect(first.body).toContain("15 minutes added by teacher");
    expect(first.body).toContain("10-second simulated clip");
    expect((await getMessages("conv-1")).some((message) => message.id === first.id)).toBe(true);
  });
  it("creates the right family's thread when none exists", async () => {
    const message = await finishLesson("stu-28_2027-02-13");
    const familyThread = conversations.find((conversation) => conversation.id === message.conversationId);
    expect(familyThread?.familyId).toBe("fam-22");
    expect(conversations.filter((conversation) => conversation.familyId === "fam-22")).toHaveLength(1);
    expect((await getMessages(message.conversationId))[0]?.id).toBe(message.id);
  });
  it("rejects a missing lesson without sending a message", async () => {
    const before = messages.length;
    expect(await getLiveLesson("missing")).toBeNull();
    await expect(finishLesson("missing")).rejects.toThrow("Lesson not found");
    expect(messages).toHaveLength(before);
  });
});