import { conversations, messages, families } from "@/mocks/data";
import type { Conversation, Message } from "@/mocks/types";
import { respond } from "./_delay";
import { englishTranslations } from "@/mocks/translations";
import { isLiveStudio } from "@/lib/studio-workspace";
import { insertLiveConversation, insertLiveMessage, markLiveMessagesRead } from "./live/chat-store";

export async function getMockEnglishTranslation(messageId: string): Promise<string> {
  const message = messages.find((entry) => entry.id === messageId);
  if (!message) throw new Error("Message not found");
  const known = englishTranslations[message.body];
  if (known) return respond(known);
  const term = message.body.match(/第 (\d) 学期/u)?.[1];
  const deadline = message.body.match(/\d{4}-\d{2}-\d{2}/u)?.[0];
  if (term && /续课邀请|续课提醒/u.test(message.body)) return respond(`${/提醒/u.test(message.body) ? "Reminder" : "Invitation"} to renew for Term ${term}: please confirm on your family Home page by ${deadline ?? "the reply deadline"}. Your current lesson times will be kept after confirmation. Let your teacher know if you would like a change or will not continue.`);
  if (term && /确认第/u.test(message.body)) return respond(`We confirm continuing in Term ${term} at our current lesson times.`);
  if (term && /暂不继续/u.test(message.body)) return respond(`We will not continue lessons in Term ${term}.`);
  if (term && /希望调整/u.test(message.body)) return respond(`We would like to discuss a change to our Term ${term} lessons.`);
  return respond("No mock English translation is available for this message.");
}

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

export async function markThreadRead(id: string, reader: "teacher" | "guardian" = "teacher") {
  const conversation = conversations.find((entry) => entry.id === id);
  if (!conversation) throw new Error("Conversation not found");
  const readAt = mockMessageTime();
  // Live studio: save who has read what before the screen shows it.
  const unread = messages.some((message) => message.conversationId === id && !message.readAt && (reader === "teacher" ? message.authorRole !== "teacher" : message.authorRole === "teacher"));
  if (unread) await markLiveMessagesRead(id, reader, readAt);
  if (reader === "teacher") conversation.unreadCount = 0;
  for (const message of messages) {
    if (message.conversationId === id && (reader === "teacher" ? message.authorRole !== "teacher" : message.authorRole === "teacher") && !message.readAt) message.readAt = readAt;
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
  const conversation: Conversation = { id: isLiveStudio() ? crypto.randomUUID() : `conv-${conversations.length + 1}`, familyId, lastMessageAt: new Date().toISOString(), unreadCount: 0 };
  conversation.id = await insertLiveConversation(conversation);
  const raced = conversations.find((entry) => entry.id === conversation.id);
  if (raced) return respond(raced);
  conversations.push(conversation);
  return respond(conversation);
}

export async function sendMessage(input: Omit<Message, "id" | "sentAt">): Promise<Message> {
  const conv = conversations.find((c) => c.id === input.conversationId);
  if (!conv) throw new Error("Conversation not found");
  if (input.kind === "text" && !input.body.trim()) throw new Error("Write a message first");
  const msg: Message = { ...input, body: input.body.trim(), id: isLiveStudio() ? crypto.randomUUID() : `msg-${messages.length + 1}`, sentAt: mockMessageTime() };
  await insertLiveMessage(msg);
  messages.push(msg);
  conv.lastMessageAt = msg.sentAt;
  if (input.authorRole !== "teacher") conv.unreadCount += 1;
  return respond(msg);
}
