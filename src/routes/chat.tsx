import { createFileRoute } from "@tanstack/react-router";
import { ChatLayout } from "@/components/ChatLayout";
import { chatThreadsQuery } from "@/lib/chat-queries";

export const Route = createFileRoute("/chat")({
  loader: ({ context }) => context.queryClient.ensureQueryData(chatThreadsQuery),
  errorComponent: () => <p role="alert">Chat could not be opened. Please refresh to try again.</p>,
  component: ChatLayout,
});
