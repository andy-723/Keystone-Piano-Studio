import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/AppShell";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Opus" },
      { name: "description", content: "Studio settings, including GST registration, are coming soon." },
      { property: "og:title", content: "Settings — Opus" },
      { property: "og:description", content: "Studio settings, including GST registration, are coming soon." },
    ],
  }),
  component: () => <ComingSoon title="Settings" note="Studio settings, including GST registration, are coming soon." />,
});
