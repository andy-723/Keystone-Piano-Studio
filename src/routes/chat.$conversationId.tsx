import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getConversations, getMessages } from "@/services/chat";
import { getFamily } from "@/services/roster";
import { formatShortDate, formatTime } from "@/lib/format";

const threadQuery = (id: string) => queryOptions({ queryKey: ["messages", id], queryFn: async () => {
  const conversation = (await getConversations()).find((entry) => entry.id === id);
  if (!conversation) return null;
  const [messages, family] = await Promise.all([getMessages(id), getFamily(conversation.familyId)]);
  return { messages, family };
} });

export const Route = createFileRoute("/chat/$conversationId")({
  loader: async ({ context, params }) => { if (!await context.queryClient.ensureQueryData(threadQuery(params.conversationId))) throw notFound(); },
  notFoundComponent: () => <p>Family conversation not found.</p>,
  errorComponent: () => <p role="alert">Messages could not be opened. Please refresh to try again.</p>,
  head: () => ({ meta: [
    { title: "Family conversation — Opus" }, { name: "description", content: "Family messages and piano lesson summaries." },
    { property: "og:title", content: "Family conversation — Opus" }, { property: "og:description", content: "Family messages and piano lesson summaries." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: FamilyThread,
});

function FamilyThread() {
  const { conversationId } = Route.useParams();
  const { data } = useSuspenseQuery(threadQuery(conversationId));
  if (!data) return null;
  return <div className="mx-auto max-w-4xl">
    <Button asChild variant="ghost"><Link to="/"><ArrowLeft aria-hidden /> Back to Today</Link></Button>
    <h1 className="mt-5 text-3xl font-semibold">{data.family?.displayName ?? "Family conversation"}</h1>
    <div className="mt-6 space-y-5">{data.messages.map((message) => <article key={message.id} className="rounded-lg border border-border bg-card p-5">
      <p className="text-base font-semibold">{message.authorName} <span className="font-normal text-muted-foreground">· {message.authorRole === "teacher" ? "Teacher" : "Family"}</span></p>
      <p className="mt-1 text-base text-muted-foreground">{formatShortDate(message.sentAt.slice(0, 10))} · {formatTime(message.sentAt)}</p>
      <p className="mt-4 whitespace-pre-wrap break-words text-lg">{message.body}</p>
    </article>)}</div>
  </div>;
}