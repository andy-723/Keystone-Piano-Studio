import { conversations, messages } from "@/mocks/data";
import type { Conversation, Message } from "@/mocks/types";
import { respond } from "./_delay";

export const getConversations = (): Promise<Conversation[]> =>
  respond([...conversations].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)));

export const getMessages = (conversationId: string): Promise<Message[]> =>
  respond(messages.filter((m) => m.conversationId === conversationId).sort((a, b) => a.sentAt.localeCompare(b.sentAt)));

export async function getOrCreateFamilyConversation(familyId: string): Promise<Conversation> {
  const existing = conversations.find((conversation) => conversation.familyId === familyId);
  if (existing) return respond(existing);
  const conversation: Conversation = { id: `conv-${conversations.length + 1}`, familyId, lastMessageAt: new Date().toISOString(), unreadCount: 0 };
  conversations.push(conversation);
  return respond(conversation);
}

export async function sendMessage(input: Omit<Message, "id" | "sentAt">): Promise<Message> {
  const msg: Message = { ...input, id: `msg-${messages.length + 1}`, sentAt: new Date().toISOString() };
  messages.push(msg);
  const conv = conversations.find((c) => c.id === input.conversationId);
  if (conv) conv.lastMessageAt = msg.sentAt;
  return respond(msg);
}
