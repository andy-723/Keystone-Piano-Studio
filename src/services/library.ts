import { libraryState } from "@/mocks/library";
import type { ImportScope } from "@/mocks/roster-import";
import type { ContentItem, CourseTemplate, LessonTemplate } from "@/mocks/types";
import { respond } from "./_delay";
export const getLibrary = (scope: ImportScope = "demo") => respond(structuredClone(libraryState[scope]));
export async function copyTemplate(kind: "lessons" | "courses" | "content", id: string, scope: ImportScope = "demo") {
  const state = libraryState[scope];
  const original = state[kind].find((item) => item.id === id);
  if (!original) throw new Error("Template not found.");
  const copy = { ...structuredClone(original), id: crypto.randomUUID(), name: "name" in original ? `${original.name} (studio copy)` : undefined, title: "title" in original ? `${original.title} (studio copy)` : undefined, supplied: false, isWelcomeDefault: false };
  if (kind === "content") state.content.push(copy as ContentItem);
  else if (kind === "lessons") state.lessons.push(copy as LessonTemplate);
  else state.courses.push(copy as CourseTemplate);
  return getLibrary(scope);
}
export async function saveContent(item: ContentItem, scope: ImportScope = "demo") {
  const state = libraryState[scope]; const index = state.content.findIndex((entry) => entry.id === item.id);
  if (state.content[index]?.supplied || item.supplied) throw new Error("Copy an Opus template before editing.");
  if (!item.title.trim() || !["text", "link", "file", "video", "audio", "checklist"].includes(item.kind)) throw new Error("Choose a title and content kind.");
  if (item.url && !/^https?:\/\//.test(item.url)) throw new Error("Use an http or https link.");
  if (index < 0) state.content.push(structuredClone(item)); else state.content[index] = structuredClone(item);
  return getLibrary(scope);
}
export async function saveLessonTemplate(item: LessonTemplate, scope: ImportScope = "demo") {
  const state = libraryState[scope]; const index = state.lessons.findIndex((entry) => entry.id === item.id);
  if (index < 0 || state.lessons[index]?.supplied || item.supplied) throw new Error("Copy an Opus template before editing.");
  if (!item.name.trim() || !item.steps.length || item.steps.some((step) => !state.content.some((content) => content.id === step.contentItemId))) throw new Error("Give the lesson a name and valid content steps.");
  if (item.isWelcomeDefault) state.lessons.forEach((entry) => { if (entry.audience === item.audience) entry.isWelcomeDefault = false; });
  state.lessons[index] = structuredClone(item); return getLibrary(scope);
}
export async function saveCourseTemplate(item: CourseTemplate, scope: ImportScope = "demo") {
  const state = libraryState[scope]; const index = state.courses.findIndex((entry) => entry.id === item.id);
  if (index < 0 || state.courses[index]?.supplied || item.supplied) throw new Error("Copy an Opus template before editing.");
  if (!item.name.trim() || !item.sections.length || item.sections.some((section) => !section.name.trim() || !Number.isFinite(section.weightPct) || section.weightPct < 0 || !section.items.length || section.items.some((title) => !title.trim())) || item.sections.reduce((sum, section) => sum + section.weightPct, 0) !== 100) throw new Error("Give each section items and weights totalling 100%.");
  state.courses[index] = structuredClone(item); return getLibrary(scope);
}