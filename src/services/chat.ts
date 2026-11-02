import { conversations, messages, families } from "@/mocks/data";
import type { Conversation, Message } from "@/mocks/types";
import { respond } from "./_delay";

export const getConversations = (): Promise<Conversation[]> =>
  respond([...conversations].sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt)).map((entry) => ({ ...entry })));

export const getMessages = (conversationId: string): Promise<Message[]> =>
  respond(messages.filter((m) => m.conversationId === conversationId).sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt)).map((entry) => ({ ...entry })));

export async function getChatThreads() {
  return (await getConversations()).map((conversation) => ({ ...conversation,
    family: families.find((family) => family.id === conversation.familyId),
    latest: messages.filter((message) => message.conversationId === conversation.id).sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))[0],
  }));
}

export async function getChatThread(id: string) {
  const conversation = conversations.find((entry) => entry.id === id);
  if (!conversation) return null;
  return { conversation: { ...conversation }, family: families.find((entry) => entry.id === conversation.familyId), messages: await getMessages(id) };
}

export async function markThreadRead(id: string) {
  const conversation = conversations.find((entry) => entry.id === id);
  if (!conversation) throw new Error("Conversation not found");
  conversation.unreadCount = 0;
  const readAt = mockMessageTime();
  for (const message of messages) {
    if (message.conversationId === id && message.authorRole !== "teacher" && !message.readAt) message.readAt = readAt;
  }
  return respond({ ...conversation });
}

// Keep session messages after the future-dated 2027 fixtures.
function mockMessageTime() {
  return new Date(Math.max(Date.now(), ...messages.map((message) => Date.parse(message.sentAt) + 60_000))).toISOString();
}

export async function getOrCreateFamilyConversation(familyId: string): Promise<Conversation> {
  const existing = conversations.find((conversation) => conversation.familyId === familyId);
  if (existing) return respond(existing);
  const conversation: Conversation = { id: `conv-${conversations.length + 1}`, familyId, lastMessageAt: new Date().toISOString(), unreadCount: 0 };
  conversations.push(conversation);
  return respond(conversation);
}

export async function sendMessage(input: Omit<Message, "id" | "sentAt">): Promise<Message> {
  const conv = conversations.find((c) => c.id === input.conversationId);
  if (!conv) throw new Error("Conversation not found");
  if (input.kind === "text" && !input.body.trim()) throw new Error("Write a message first");
  const msg: Message = { ...input, body: input.body.trim(), id: `msg-${messages.length + 1}`, sentAt: mockMessageTime() };
  messages.push(msg);
  conv.lastMessageAt = msg.sentAt;
  if (input.authorRole !== "teacher") conv.unreadCount += 1;
  return respond(msg);
}
