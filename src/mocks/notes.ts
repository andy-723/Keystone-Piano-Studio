import { families, students, teacher } from "./data";
import { studentAttendance } from "./student-attendance";
import type { ClientNote } from "./types";
import { melbourneIso } from "@/lib/calendar";

export const clientNotes: ClientNote[] = [];
const lessonBodies = ["Left-hand fingering in bars 9–12 still unsteady. Slow practice at 60 bpm.", "Ready to start the next set of scales. Keep wrists loose and listen for an even tone.", "Lost focus after 20 minutes; tired after school sport. Short practice sessions will help.", "List B phrasing is improving. Sing the melody before playing it again.", "Good progress with sight-reading. Check the key signature before starting."];
for (const [index, [id, status]] of [...studentAttendance.entries()].entries()) {
  if (index % 2 !== 0 || status !== "attended") continue;
  const [studentId, date] = id.split("_");
  if (!studentId || !date) continue;
  clientNotes.push({ id: `note-${clientNotes.length + 1}`, subjectType: "student", subjectId: studentId, authorName: teacher.name, body: lessonBodies[index % lessonBodies.length] ?? lessonBodies[0] ?? "Steady progress today.", category: "lesson", visibility: "private", pinned: false, createdAt: melbourneIso(date, "19:00"), lessonOccurrenceId: id });
}
families.forEach((family, index) => {
  const student = students.find((entry) => entry.familyId === family.id);
  const reminders = ["Prefers Saturday mornings when arranging make-up lessons.", "Asked about paying the term in two instalments.", `${student?.firstName ?? "Student"} is nervous before exams; keep feedback encouraging.`];
  for (let n = 0; n < 1 + index % 3; n++) clientNotes.push({ id: `note-${clientNotes.length + 1}`, subjectType: "family", subjectId: family.id, authorName: teacher.name, body: reminders[(index + n) % reminders.length] ?? "Keep communication encouraging.", category: n === 1 ? "billing" : index % 2 === 0 ? "pastoral" : "general", visibility: "private", pinned: n === 0 && index % 3 === 0, createdAt: melbourneIso("2027-02-03", "18:00") });
});
students.slice(0, 15).forEach((student, index) => clientNotes.push({ id: `note-${clientNotes.length + 1}`, subjectType: "student", subjectId: student.id, authorName: teacher.name, body: index % 2 === 0 ? "Try five minutes of slow scales each day, keeping both hands relaxed." : "Lovely progress with phrasing. Practise one short section at a time and finish with a favourite piece.", category: "lesson", visibility: "shared", pinned: false, createdAt: melbourneIso("2027-03-05", "19:00") }));
clientNotes.push({ id: `note-${clientNotes.length + 1}`, subjectType: "student", subjectId: "stu-1", authorName: teacher.name, body: "Lucy is nervous before exams; keep feedback encouraging.", category: "pastoral", visibility: "private", pinned: true, createdAt: melbourneIso("2027-02-12", "18:00") });