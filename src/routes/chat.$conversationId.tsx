import { createFileRoute, notFound } from "@tanstack/react-router";
import { ChatConversation } from "@/components/ChatConversation";
import { chatThreadQuery } from "@/lib/chat-queries";
import { getStudentCheckInTemplate } from "@/services/students";

export const Route = createFileRoute("/chat/$conversationId")({
  validateSearch: (search: Record<string, unknown>): { checkIn?: string } => typeof search["checkIn"] === "string" ? { checkIn: search["checkIn"] } : {},
  loaderDeps: ({ search }) => ({ checkIn: search.checkIn }),
  loader: async ({ context, params, deps }) => {
    if (!await context.queryClient.ensureQueryData(chatThreadQuery(params.conversationId))) throw notFound();
    return { initialText: deps.checkIn ? await getStudentCheckInTemplate(deps.checkIn, params.conversationId) : "" };
  },
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
  const { checkIn } = Route.useSearch();
  const { initialText } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  return <ChatConversation id={conversationId} initialText={initialText} draftKey={checkIn ?? ""} onSent={() => { if (checkIn) void navigate({ search: {}, replace: true }); }} />;
}