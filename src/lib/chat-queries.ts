import { queryOptions } from "@tanstack/react-query";
import { getChatThread, getChatThreads } from "@/services/chat";

export const chatThreadsQuery = queryOptions({ queryKey: ["chat-threads"], queryFn: getChatThreads });
export const chatThreadQuery = (id: string) => queryOptions({ queryKey: ["messages", id], queryFn: () => getChatThread(id) });

export function messageDay(iso: string) {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const part = (name: string) => parts.find((entry) => entry.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}