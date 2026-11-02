import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/AppShell";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — Opus" },
      { name: "description", content: "Family chat threads are coming soon." },
      { property: "og:title", content: "Chat — Opus" },
      { property: "og:description", content: "Family chat threads are coming soon." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <ComingSoon title="Chat" note="Family chat threads are coming soon." />,
});
