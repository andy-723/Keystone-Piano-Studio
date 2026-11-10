/**
 * Live family chat (0013). One conversation per family; messages are append-only apart from
 * read_at. Same pattern as studio-store: loaded at sign-in, saved to Supabase before the
 * in-memory store changes.
 */
import { conversations, messages } from "@/mocks/data";
import type { Conversation, Message } from "@/mocks/types";
import { liveStudioId, liveUserId, type StudioWorkspace } from "@/lib/studio-workspace";
import { client, friendly, type Client } from "./client";

type ConversationRow = { id: string; family_id: string; last_message_at: string };
type MessageRow = {
  id: string;
  conversation_id: string;
  author_role: Message["authorRole"];
  author_name: string;
  kind: Message["kind"];
  body: string;
  metadata: MessageMetadata | null;
  sent_at: string;
  read_at: string | null;
};
type MessageMetadata = Pick<
  Message,
  "media" | "lessonSummary" | "intakeRecordId" | "welcomeSummary" | "assignmentCard"
>;

const METADATA_KEYS = [
  "media",
  "lessonSummary",
  "intakeRecordId",
  "welcomeSummary",
  "assignmentCard",
] as const;

/** Extras saved with a message. Browser-only object URLs (blob:) are dropped: they die with the tab. */
export function messageMetadata(message: Message): MessageMetadata {
  const out: Record<string, unknown> = {};
  for (const key of METADATA_KEYS) {
    if (message[key] !== undefined) out[key] = structuredClone(message[key]);
  }
  const media = out["media"] as Message["media"] | undefined;
  if (media) {
    if (media.url?.startsWith("blob:")) delete media.url;
    if (media.thumbnailUrl?.startsWith("blob:")) delete media.thumbnailUrl;
  }
  return out as MessageMetadata;
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorName: row.author_name,
    authorRole: row.author_role,
    kind: row.kind,
    body: row.body,
    sentAt: row.sent_at,
    ...(row.read_at ? { readAt: row.read_at } : {}),
    ...(row.metadata ?? {}),
  };
}

/** Fills the chat store. A missing 0013 leaves chat empty (logged) rather than blocking sign-in. */
export async function loadLiveChat(
  workspace: Extract<StudioWorkspace, { mode: "live" }>,
  c: Client,
) {
  const [convRes, msgRes] = await Promise.all([
    c
      .from("conversation")
      .select("id, family_id, last_message_at")
      .eq("studio_id", workspace.studioId)
      .order("last_message_at", { ascending: false }),
    c
      .from("message")
      .select(
        "id, conversation_id, author_role, author_name, kind, body, metadata, sent_at, read_at",
      )
      .eq("studio_id", workspace.studioId)
      .order("sent_at", { ascending: true }),
  ]);
  if (convRes.error || msgRes.error) {
    console.error("[chat-store] chat not loaded", (convRes.error ?? msgRes.error)?.message);
    return;
  }
  const loaded = ((msgRes.data ?? []) as MessageRow[]).map(toMessage);
  messages.push(...loaded);
  const staffView = workspace.role !== "guardian";
  conversations.push(
    ...((convRes.data ?? []) as ConversationRow[]).map((row): Conversation => ({
      id: row.id,
      familyId: row.family_id,
      lastMessageAt: row.last_message_at,
      // Unread for the person signed in: the other side's messages nobody has marked read.
      unreadCount: loaded.filter(
        (m) =>
          m.conversationId === row.id &&
          !m.readAt &&
          (staffView ? m.authorRole !== "teacher" : m.authorRole === "teacher"),
      ).length,
    })),
  );
}

/**
 * Saves a new family conversation and returns its id. If another tab or teacher created the
 * family's chat first (unique per family), the existing one is used instead.
 */
export async function insertLiveConversation(conversation: Conversation): Promise<string> {
  const studioId = liveStudioId();
  if (!studioId) return conversation.id;
  const c = client();
  const { error } = await c.from("conversation").insert({
    id: conversation.id,
    studio_id: studioId,
    family_id: conversation.familyId,
    last_message_at: conversation.lastMessageAt,
  });
  if (!error) return conversation.id;
  if (error.code === "23505") {
    const existing = await c
      .from("conversation")
      .select("id")
      .eq("studio_id", studioId)
      .eq("family_id", conversation.familyId)
      .maybeSingle();
    if (!existing.error && existing.data) return (existing.data as { id: string }).id;
  }
  throw friendly(error, "Couldn't start this family chat. Please try again.");
}

export async function insertLiveMessage(message: Message) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const { error } = await client()
    .from("message")
    .insert({
      id: message.id,
      studio_id: studioId,
      conversation_id: message.conversationId,
      author_user_id: liveUserId(),
      author_role: message.authorRole,
      author_name: message.authorName,
      kind: message.kind,
      body: message.body,
      metadata: messageMetadata(message),
      sent_at: message.sentAt,
    });
  if (error) throw friendly(error, "Couldn't send this message. Please try again.");
}

/** Marks the other side's messages in a conversation as read. */
export async function markLiveMessagesRead(
  conversationId: string,
  reader: "teacher" | "guardian",
  readAt: string,
) {
  if (!liveStudioId()) return;
  const query = client()
    .from("message")
    .update({ read_at: readAt })
    .eq("conversation_id", conversationId)
    .is("read_at", null);
  const { error } =
    reader === "teacher"
      ? await query.neq("author_role", "teacher")
      : await query.eq("author_role", "teacher");
  if (error) throw friendly(error, "Couldn't mark these messages as read.");
}
