import { createFileRoute, notFound } from "@tanstack/react-router";
import { ChatConversation } from "@/components/ChatConversation";
import { chatThreadQuery } from "@/lib/chat-queries";

export const Route = createFileRoute("/chat/$conversationId")({
  loader: async ({ context, params }) => { if (!await context.queryClient.ensureQueryData(chatThreadQuery(params.conversationId))) throw notFound(); },
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
  return <ChatConversation id={conversationId} />;
}