/**
 * Live studio news and manual student groups (0014). Same pattern as studio-store: loaded at
 * sign-in, saved to Supabase before the in-memory store changes.
 */
import { newsState, type Announcement, type NewsAttachment, type StudentGroup } from "@/mocks/news";
import { liveStudioId, liveUserId, type StudioWorkspace } from "@/lib/studio-workspace";
import { client, friendly, type Client } from "./client";

type PostRow = {
  id: string;
  author_user_id: string;
  author_name: string;
  title: string;
  body: string;
  tag: Announcement["tag"];
  audience: Announcement["audience"];
  important: boolean;
  status: Announcement["status"];
  publish_at: string;
  pinned_until: string | null;
  expires_at: string | null;
  event_date: string | null;
  edited_at: string | null;
  attachments: NewsAttachment[] | null;
};
type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  student_ids: string[] | null;
  owner_user_id: string | null;
  archived: boolean;
};

function toPost(row: PostRow, studioId: string): Announcement {
  return {
    id: row.id,
    studioId,
    authorMembershipId: row.author_user_id,
    authorName: row.author_name,
    title: row.title,
    body: row.body,
    tag: row.tag,
    audience: row.audience,
    important: row.important,
    status: row.status,
    publishAt: row.publish_at,
    attachments: row.attachments ?? [],
    ...(row.pinned_until ? { pinnedUntil: row.pinned_until } : {}),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(row.event_date ? { eventDate: row.event_date } : {}),
    ...(row.edited_at ? { editedAt: row.edited_at } : {}),
  };
}

function toGroup(row: GroupRow, studioId: string): StudentGroup {
  return {
    id: row.id,
    studioId,
    name: row.name,
    kind: "manual",
    studentIds: row.student_ids ?? [],
    ...(row.description ? { description: row.description } : {}),
    ...(row.owner_user_id ? { ownerMembershipId: row.owner_user_id } : {}),
    ...(row.archived ? { archived: true } : {}),
  };
}

/** Fills news and groups. A missing 0014 leaves them empty (logged) rather than blocking sign-in. */
export async function loadLiveNews(
  workspace: Extract<StudioWorkspace, { mode: "live" }>,
  c: Client,
) {
  const state = newsState.demo;
  // The signed-in person is the author; posts are theirs to edit by user id.
  state.membership.id = workspace.userId;
  if (workspace.role === "guardian") return;
  const [postRes, groupRes] = await Promise.all([
    c
      .from("news_post")
      .select(
        "id, author_user_id, author_name, title, body, tag, audience, important, status, publish_at, pinned_until, expires_at, event_date, edited_at, attachments",
      )
      .eq("studio_id", workspace.studioId)
      .order("publish_at", { ascending: false }),
    c
      .from("student_group")
      .select("id, name, description, student_ids, owner_user_id, archived")
      .eq("studio_id", workspace.studioId)
      .order("created_at", { ascending: true }),
  ]);
  if (postRes.error || groupRes.error) {
    console.error("[news-store] news not loaded", (postRes.error ?? groupRes.error)?.message);
    return;
  }
  state.posts = ((postRes.data ?? []) as PostRow[]).map((row) => toPost(row, workspace.studioId));
  state.groups = ((groupRes.data ?? []) as GroupRow[]).map((row) =>
    toGroup(row, workspace.studioId),
  );
  state.membership.groupIds = state.groups.map((group) => group.id);
}

/** Attachments keep their name, kind and the students shown; browser-only links are not saved. */
function savedAttachments(list: NewsAttachment[]) {
  return list.map(({ url, ...rest }) =>
    url && !url.startsWith("blob:") ? { ...rest, url } : rest,
  );
}

export async function saveLivePost(post: Announcement, isNew: boolean) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const row = {
    author_name: post.authorName,
    title: post.title,
    body: post.body,
    tag: post.tag,
    audience: post.audience,
    important: post.important,
    status: post.status,
    publish_at: post.publishAt,
    pinned_until: post.pinnedUntil ?? null,
    expires_at: post.expiresAt ?? null,
    event_date: post.eventDate ?? null,
    edited_at: post.editedAt ?? null,
    attachments: savedAttachments(post.attachments),
  };
  const c = client();
  const { error } = isNew
    ? await c
        .from("news_post")
        .insert({ id: post.id, studio_id: studioId, author_user_id: liveUserId(), ...row })
    : await c.from("news_post").update(row).eq("id", post.id).eq("studio_id", studioId);
  if (error) throw friendly(error, "Couldn't save this post. Please try again.");
}

export async function saveLiveGroup(group: StudentGroup, isNew: boolean) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const row = {
    name: group.name,
    description: group.description ?? null,
    student_ids: group.studentIds,
    archived: Boolean(group.archived),
  };
  const c = client();
  const { error } = isNew
    ? await c
        .from("student_group")
        .insert({ id: group.id, studio_id: studioId, owner_user_id: liveUserId(), ...row })
    : await c.from("student_group").update(row).eq("id", group.id).eq("studio_id", studioId);
  if (error) throw friendly(error, "Couldn't save this group. Please try again.");
}

export async function deleteLiveGroup(groupId: string) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const { error } = await client()
    .from("student_group")
    .delete()
    .eq("id", groupId)
    .eq("studio_id", studioId);
  if (error) throw friendly(error, "Couldn't delete this group. Please try again.");
}
