import { libraryState } from "@/mocks/library";
import type { ImportScope } from "@/mocks/roster-import";
import type { ContentItem, CourseTemplate, LessonTemplate } from "@/mocks/types";
import { videoLinksEnabled } from "@/lib/app-settings";
import { respond } from "./_delay";

const ALLOWED_VIDEO_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
]);

/** Hostname-validated YouTube/Vimeo URLs only. Never embed a player. */
export function isAllowedVideoLinkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return ALLOWED_VIDEO_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const getLibrary = (scope: ImportScope = "demo") =>
  respond(structuredClone(libraryState[scope]));
export async function copyTemplate(
  kind: "lessons" | "courses" | "content",
  id: string,
  scope: ImportScope = "demo",
) {
  const state = libraryState[scope];
  const original = state[kind].find((item) => item.id === id);
  if (!original) throw new Error("Template not found.");
  const copy = {
    ...structuredClone(original),
    id: crypto.randomUUID(),
    ...("name" in original
      ? { name: `${original.name} (studio copy)` }
      : { title: `${original.title} (studio copy)` }),
    supplied: false,
    ...("steps" in original ? { isWelcomeDefault: false } : {}),
  };
  if (kind === "content") state.content.push(copy as ContentItem);
  else if (kind === "lessons") state.lessons.push(copy as LessonTemplate);
  else state.courses.push(copy as CourseTemplate);
  return getLibrary(scope);
}
export async function saveContent(item: ContentItem, scope: ImportScope = "demo") {
  const state = libraryState[scope];
  const index = state.content.findIndex((entry) => entry.id === item.id);
  if (state.content[index]?.supplied || item.supplied)
    throw new Error("Copy a Keystone Music HQ template before editing.");
  const kinds = [
    "text",
    "link",
    "file",
    "video",
    "audio",
    "checklist",
    ...(videoLinksEnabled ? ["video_link"] : []),
  ];
  if (!item.title.trim() || !kinds.includes(item.kind))
    throw new Error("Choose a title and content kind.");
  if (item.kind === "video_link") {
    if (!videoLinksEnabled) throw new Error("Video links are not available yet.");
    if (!item.url || !isAllowedVideoLinkUrl(item.url)) {
      throw new Error("Use a YouTube or Vimeo link.");
    }
  } else if (item.url && !/^https?:\/\//.test(item.url)) {
    throw new Error("Use an http or https link.");
  }
  if (index < 0) state.content.push(structuredClone(item));
  else state.content[index] = structuredClone(item);
  return getLibrary(scope);
}
export async function saveLessonTemplate(item: LessonTemplate, scope: ImportScope = "demo") {
  const state = libraryState[scope];
  const index = state.lessons.findIndex((entry) => entry.id === item.id);
  if (index < 0 || state.lessons[index]?.supplied || item.supplied)
    throw new Error("Copy a Keystone Music HQ template before editing.");
  if (
    !item.name.trim() ||
    !item.steps.length ||
    item.steps.some((step) => !state.content.some((content) => content.id === step.contentItemId))
  )
    throw new Error("Give the lesson a name and valid content steps.");
  if (item.isWelcomeDefault)
    state.lessons.forEach((entry) => {
      if (entry.audience === item.audience) entry.isWelcomeDefault = false;
    });
  state.lessons[index] = structuredClone(item);
  return getLibrary(scope);
}
export async function saveCourseTemplate(item: CourseTemplate, scope: ImportScope = "demo") {
  const state = libraryState[scope];
  const index = state.courses.findIndex((entry) => entry.id === item.id);
  if (index < 0 || state.courses[index]?.supplied || item.supplied)
    throw new Error("Copy a Keystone Music HQ template before editing.");
  if (
    !item.name.trim() ||
    !item.sections.length ||
    item.sections.some(
      (section) =>
        !section.name.trim() ||
        !Number.isFinite(section.weightPct) ||
        section.weightPct < 0 ||
        !section.items.length ||
        section.items.some((title) => !title.trim()),
    ) ||
    item.sections.reduce((sum, section) => sum + section.weightPct, 0) !== 100
  )
    throw new Error("Give each section items and weights totalling 100%.");
  state.courses[index] = structuredClone(item);
  return getLibrary(scope);
}
