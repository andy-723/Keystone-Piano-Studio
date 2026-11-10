import { libraryState } from "@/mocks/library";
import type { ImportScope } from "@/mocks/roster-import";
import type { ContentItem, CourseTemplate, LessonTemplate } from "@/mocks/types";
import { videoLinksEnabled } from "@/lib/app-settings";
import { respond } from "./_delay";
import { isLiveStudio } from "@/lib/studio-workspace";
import { saveLiveLibraryItems, type LibraryTab } from "./live/course-store";

type LibraryEntry = ContentItem | LessonTemplate | CourseTemplate;

/**
 * Runs a Library change and, for a live studio's own Library, saves the items it names. A failed
 * save puts that Library list back as it was.
 */
async function withLibrarySave(
  scope: ImportScope,
  tab: LibraryTab,
  change: () => LibraryEntry[],
) {
  const state = libraryState[scope];
  if (scope !== "demo" || !isLiveStudio()) {
    change();
    return;
  }
  const before = structuredClone(state[tab]);
  try {
    await saveLiveLibraryItems(tab, change());
  } catch (error) {
    (state[tab] as LibraryEntry[]).splice(0, state[tab].length, ...before);
    throw error;
  }
}

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
  await withLibrarySave(scope, kind, () => {
    if (kind === "content") state.content.push(copy as ContentItem);
    else if (kind === "lessons") state.lessons.push(copy as LessonTemplate);
    else state.courses.push(copy as CourseTemplate);
    return [copy as LibraryEntry];
  });
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
  await withLibrarySave(scope, "content", () => {
    if (index < 0) state.content.push(structuredClone(item));
    else state.content[index] = structuredClone(item);
    return [item];
  });
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
  await withLibrarySave(scope, "lessons", () => {
    // Moving the welcome default also changes the other studio lessons for that audience.
    const changed: LessonTemplate[] = [item];
    if (item.isWelcomeDefault)
      state.lessons.forEach((entry) => {
        if (entry.audience === item.audience && entry.isWelcomeDefault && entry.id !== item.id) {
          entry.isWelcomeDefault = false;
          changed.push(entry);
        }
      });
    state.lessons[index] = structuredClone(item);
    return changed;
  });
  return getLibrary(scope);
}
/** Saves a studio course template. A new id adds a blank template made in the Library. */
export async function saveCourseTemplate(input: CourseTemplate, scope: ImportScope = "demo") {
  const state = libraryState[scope];
  const index = state.courses.findIndex((entry) => entry.id === input.id);
  if (state.courses[index]?.supplied || input.supplied)
    throw new Error("Copy a Keystone Music HQ template before editing.");
  // Drop blank lines left by the one-item-per-line box.
  const item: CourseTemplate = {
    ...input,
    name: input.name.trim(),
    sections: input.sections.map((section) => ({
      ...section,
      name: section.name.trim(),
      items: section.items.map((title) => title.trim()).filter(Boolean),
    })),
  };
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
  await withLibrarySave(scope, "courses", () => {
    if (index < 0) state.courses.push(structuredClone({ ...item, supplied: false }));
    else state.courses[index] = structuredClone(item);
    return [{ ...item, supplied: false }];
  });
  return getLibrary(scope);
}
