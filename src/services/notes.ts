import { clientNotes } from "@/mocks/notes";
import { families, students, teacher } from "@/mocks/data";
import type { ClientNote } from "@/mocks/types";
import { melbourneIso, PROTOTYPE_TODAY } from "@/lib/calendar";
import { respond } from "./_delay";

const ordered = (notes: ClientNote[]) => [...notes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
export const getNotes = (subjectType: ClientNote["subjectType"], subjectId: string) => respond(ordered(clientNotes.filter((note) => note.subjectType === subjectType && note.subjectId === subjectId)));
export const getRecentNotes = (limit: number) => respond(ordered(clientNotes).slice(0, Math.max(0, Math.floor(limit))));
export async function getStudentNoteContext(studentId: string) {
  const student = students.find((entry) => entry.id === studentId);
  const notes = ordered(clientNotes.filter((note) => (note.subjectType === "student" && note.subjectId === studentId) || (note.subjectType === "family" && note.subjectId === student?.familyId)));
  return respond({ latest: notes.find((note) => note.subjectType === "student" && note.category === "lesson") ?? null, pinned: notes.filter((note) => note.pinned) });
}
export async function addNote(input: Omit<ClientNote, "id" | "createdAt" | "authorName" | "visibility" | "pinned"> & Partial<Pick<ClientNote, "visibility" | "pinned" | "authorName">>) {
  if (!input.body.trim()) throw new Error("Write a note first");
  if (input.subjectType === "student" ? !students.some((student) => student.id === input.subjectId) : !families.some((family) => family.id === input.subjectId)) throw new Error("Note subject not found");
  const note: ClientNote = { ...input, body: input.body.trim(), visibility: input.visibility ?? "private", pinned: input.pinned ?? false, authorName: input.authorName ?? teacher.name, id: `note-${crypto.randomUUID()}`, createdAt: new Date(Math.max(Date.parse(melbourneIso(PROTOTYPE_TODAY, "19:00")), ...clientNotes.map((note) => Date.parse(note.createdAt) + 1000))).toISOString() };
  clientNotes.push(note);
  return respond(note);
}
export async function updateNote(id: string, input: Partial<Pick<ClientNote, "body" | "category" | "visibility" | "pinned">>) {
  const note = clientNotes.find((entry) => entry.id === id);
  if (!note) throw new Error("Note not found");
  if (input.body !== undefined && !input.body.trim()) throw new Error("Write a note first");
  Object.assign(note, input, input.body === undefined ? {} : { body: input.body.trim() });
  return respond(note);
}
export async function togglePin(id: string) {
  const note = clientNotes.find((entry) => entry.id === id);
  if (!note) throw new Error("Note not found");
  return updateNote(id, { pinned: !note.pinned });
}
export async function deleteNote(id: string) {
  const index = clientNotes.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error("Note not found");
  clientNotes.splice(index, 1);
  return respond(undefined);
}