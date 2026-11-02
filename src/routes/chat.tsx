import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
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
  component: ChatLayout,
});

function ChatLayout() {
  const isIndex = useRouterState({ select: (state) => state.location.pathname === "/chat" });
  return <>{isIndex && <ComingSoon title="Chat" note="Family chat threads are coming soon." />}<Outlet /></>;
}
