/**
 * Family portal content for parents of real studios (23 Nov 2026). Parents can't read news,
 * courses or the calendar under the database rules, so the server sends a family-safe copy
 * (src/server/family-portal.ts) and this puts it where the parent screens already look:
 * news posts (addressed to this family only), the children's active courses (shared feedback
 * only), the next 4 weeks of lessons, the last 8 weeks of practice and the teacher's shared notes.
 */
import { getAuthClient } from "@/lib/auth-client";
import type { FamilyLesson, FamilyNewsPost } from "@/lib/family-portal";
import type { StudioWorkspace } from "@/lib/studio-workspace";
import { newsState, type Announcement, type NewsTag } from "@/mocks/news";
import { practiceLogs } from "@/mocks/data";
import { clientNotes } from "@/mocks/notes";
import {
  familyPortalFn,
  type FamilyAttendance,
  type FamilyMakeUps,
  type FamilyPortalContent,
} from "@/server/family-portal";
import { pushCourseDocument } from "./course-store";

export const familyPortalState: {
  loaded: boolean;
  today: string | null;
  lessons: FamilyLesson[];
  /** Make-up credits each child can use (0025). */
  makeUps: FamilyMakeUps[];
  /** The last 8 weeks of marked lessons (0025). */
  attendance: FamilyAttendance[];
} = {
  loaded: false,
  today: null,
  lessons: [],
  makeUps: [],
  attendance: [],
};

export type FamilyPortalLoader = (studioId: string) => Promise<FamilyPortalContent | null>;

async function familyPortalFromServer(studioId: string) {
  const session = (await getAuthClient()?.auth.getSession())?.data.session;
  if (!session) throw new Error("Your sign-in has ended. Please sign in again.");
  const { content } = await familyPortalFn({
    data: { accessToken: session.access_token, studioId },
  });
  return content;
}

function toAnnouncement(post: FamilyNewsPost, studioId: string, familyId: string): Announcement {
  return {
    id: post.id,
    studioId,
    authorMembershipId: "",
    authorName: post.authorName,
    title: post.title,
    body: post.body,
    tag: post.tag as NewsTag,
    // The server already chose the posts for this family; address each to it alone.
    audience: { kind: "families", familyIds: [familyId] },
    important: post.important,
    status: "published",
    publishAt: post.publishAt,
    attachments: [],
    ...(post.pinnedUntil ? { pinnedUntil: post.pinnedUntil } : {}),
    ...(post.expiresAt ? { expiresAt: post.expiresAt } : {}),
    ...(post.eventDate ? { eventDate: post.eventDate } : {}),
    ...(post.editedAt ? { editedAt: post.editedAt } : {}),
  };
}

/**
 * Loads the family's portal content. A failure leaves the portal showing invoices and chat
 * (logged), rather than blocking the parent's sign-in.
 */
export async function loadLiveFamilyPortal(
  workspace: Extract<StudioWorkspace, { mode: "live" }>,
  familyId: string | null,
  load: FamilyPortalLoader = familyPortalFromServer,
) {
  familyPortalState.loaded = false;
  familyPortalState.today = null;
  familyPortalState.lessons = [];
  familyPortalState.makeUps = [];
  familyPortalState.attendance = [];
  if (workspace.role !== "guardian" || !familyId) return;
  let content: FamilyPortalContent | null;
  try {
    content = await load(workspace.studioId);
  } catch (error) {
    console.error("[family-store] family portal not loaded", (error as Error).message);
    return;
  }
  if (!content) return;
  newsState.demo.posts = content.news.map((post) =>
    toAnnouncement(post, workspace.studioId, familyId),
  );
  for (const doc of content.courses) pushCourseDocument(doc);
  // Practice and shared notes (0023); an older server sends neither.
  practiceLogs.push(...(content.practice ?? []));
  clientNotes.push(...(content.notes ?? []));
  familyPortalState.today = content.today;
  familyPortalState.lessons = content.lessons;
  // Make-ups and attendance (0025); an older server sends neither.
  familyPortalState.makeUps = content.makeUps ?? [];
  familyPortalState.attendance = content.attendance ?? [];
  familyPortalState.loaded = true;
}
