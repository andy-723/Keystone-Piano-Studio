import { afterEach, expect, it } from "vitest";
import { conversations, messages } from "@/mocks/data";
import { getChatThread, getChatThreads, getMessages, markThreadRead, sendMessage, getMockEnglishTranslation } from "@/services/chat";
import { messageDay } from "@/lib/chat-queries";
const original = { conversations: structuredClone(conversations), messages: structuredClone(messages) };
afterEach(() => {
  conversations.splice(0, conversations.length, ...structuredClone(original.conversations));
  messages.splice(0, messages.length, ...structuredClone(original.messages));
});
it("lists families newest first by timestamp and returns only the selected family's messages", async () => {
  const threads = await getChatThreads();
  expect(threads[0]?.familyId).toBe("fam-19");
  expect(threads.every((thread, index) => index === 0 || Date.parse(threads[index - 1]?.lastMessageAt ?? "") >= Date.parse(thread.lastMessageAt))).toBe(true);
  const thread = await getChatThread("conv-1");
  expect(thread?.family?.id).toBe("fam-1");
  expect(thread?.messages).toHaveLength(10);
  expect(thread?.messages.every((message) => message.conversationId === "conv-1")).toBe(true);
});
it("opening a thread clears only that family's unread messages", async () => {
  await markThreadRead("conv-1");
  expect((await getChatThreads()).find((entry) => entry.id === "conv-1")?.unreadCount).toBe(0);
  expect((await getMessages("conv-1")).filter((message) => message.authorRole === "guardian").every((message) => Boolean(message.readAt))).toBe(true);
  expect(conversations.find((entry) => entry.id === "conv-2")?.unreadCount).toBe(1);
});
it.each(["text", "voice", "video", "image"] as const)("saves a %s message and moves the family to the top without faking a family read", async (kind) => {
  const message = await sendMessage({ conversationId: "conv-4", authorName: "Ms Clarke", authorRole: "teacher", body: "Practice update", kind, ...(kind === "text" ? {} : { media: { url: "blob:session-media", durationSeconds: 10 } }) });
  expect((await getMessages("conv-4")).at(-1)).toMatchObject({ id: message.id, kind, body: "Practice update" });
  expect((await getChatThreads())[0]?.id).toBe("conv-4");
  expect(message.readAt).toBeUndefined();
  if (kind !== "text") expect(message.media?.durationSeconds).toBe(10);
});
it("does not send empty text or send into an unknown family thread", async () => {
  const before = messages.length;
  const input = { conversationId: "conv-1", authorName: "Ms Clarke", authorRole: "teacher" as const, body: "  ", kind: "text" as const };
  await expect(sendMessage(input)).rejects.toThrow("Write a message first");
  await expect(sendMessage({ ...input, conversationId: "unknown", body: "Hello" })).rejects.toThrow("Conversation not found");
  expect(messages).toHaveLength(before);
});
it("groups messages by the Melbourne day rather than UTC", () => {
  expect(messageDay("2027-02-08T14:30:00Z")).toBe("2027-02-09");
});
it("returns a mock English translation without changing the original Chinese message", async () => {
  const message = messages.find((entry) => entry.body === "谢谢老师！她每天都在练习。");
  if (!message) throw new Error("Missing Chinese fixture");
  expect(await getMockEnglishTranslation(message.id)).toBe("Thank you, teacher! She practises every day.");
  expect(messages.find((entry) => entry.id === message.id)?.body).toBe("谢谢老师！她每天都在练习。");
});