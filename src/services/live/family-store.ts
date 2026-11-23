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
import { familyCompleteTaskFn, familyDeletePracticeFn } from "@/server/family-assignments";
import type { FamilyAssignment } from "@/lib/live-assignments";
import { pushCourseDocument } from "./course-store";
import { familyAnswerRenewalFn, familyRenewalsFn, type FamilyRenewal } from "@/server/family-renewals";
import { renewalAnswerChatBody } from "@/lib/term-billing";
import { getOrCreateFamilyConversation, sendMessage } from "../chat";

export const familyPortalState: {
  loaded: boolean;
  today: string | null;
  lessons: FamilyLesson[];
  /** Make-up credits each child can use (0025). */
  makeUps: FamilyMakeUps[];
  /** The last 8 weeks of marked lessons (0025). */
  attendance: FamilyAttendance[];
  /** Practice tasks due from 14 days ago, with marks (0026). */
  assignments: FamilyAssignment[];
} = {
  loaded: false,
  today: null,
  lessons: [],
  makeUps: [],
  attendance: [],
  assignments: [],
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
  familyPortalState.assignments = [];
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
  // Practice tasks (0026); an older server sends none.
  familyPortalState.assignments = content.assignments ?? [];
  familyPortalState.loaded = true;
}

async function familyAccessToken() {
  const session = (await getAuthClient()?.auth.getSession())?.data.session;
  if (!session) throw new Error("Your sign-in has ended. Please sign in again.");
  return session.access_token;
}

/** Ticks off a practice task and logs the minutes as today's practice (server-checked). */
export async function completeLiveFamilyTask(studioId: string, taskId: string, minutes: number) {
  const { assignment, log } = await familyCompleteTaskFn({
    data: { accessToken: await familyAccessToken(), studioId, taskId, minutes },
  });
  const index = familyPortalState.assignments.findIndex((entry) => entry.id === assignment.id);
  if (index >= 0) familyPortalState.assignments[index] = assignment;
  if (log) practiceLogs.push(log);
  return assignment;
}

/** Deletes one of the family's own practice entries; a task it ticked is un-ticked. */
export async function deleteLiveFamilyPractice(studioId: string, practiceId: string) {
  await familyDeletePracticeFn({
    data: { accessToken: await familyAccessToken(), studioId, practiceId },
  });
  const index = practiceLogs.findIndex((entry) => entry.id === practiceId);
  if (index >= 0) practiceLogs.splice(index, 1);
  for (const assignment of familyPortalState.assignments)
    for (const task of assignment.tasks)
      if (task.practiceLogId === practiceId)
        Object.assign(task, { doneAt: null, doneBy: null, practiceLogId: null });
}

/** The family's renewal invitations for terms that haven't ended (0027). */
export async function liveFamilyRenewals(studioId: string): Promise<FamilyRenewal[]> {
  const { renewals } = await familyRenewalsFn({
    data: { accessToken: await familyAccessToken(), studioId },
  });
  return renewals;
}

/**
 * Saves the family's answer on the server, then posts it to the family chat so the teacher
 * sees it there too. A second tap saves nothing and posts nothing.
 */
export async function answerLiveFamilyRenewal(
  studioId: string,
  input: { responseId: string; status: "confirmed" | "change_requested" | "declined"; note: string },
  author: { name: string },
): Promise<FamilyRenewal> {
  const { renewal, changed } = await familyAnswerRenewalFn({
    data: { accessToken: await familyAccessToken(), studioId, ...input },
  });
  if (changed) {
    try {
      const conversation = await getOrCreateFamilyConversation(renewal.familyId);
      await sendMessage({
        conversationId: conversation.id,
        authorName: author.name || "Parent",
        authorRole: "guardian",
        kind: "text",
        body: renewalAnswerChatBody(renewal.status, renewal.termName, input.note),
      });
    } catch {
      // The answer is saved; the teacher still sees it on the renewals screen.
    }
  }
  return renewal;
}
