import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/AppShell";

export const Route = createFileRoute("/students")({
  head: () => ({
    meta: [
      { title: "Students — Opus" },
      { name: "description", content: "Your roster with Red Risk badges is coming soon." },
      { property: "og:title", content: "Students — Opus" },
      { property: "og:description", content: "Your roster with Red Risk badges is coming soon." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <ComingSoon title="Students" note="Your roster with Red Risk badges is coming soon." />,
});
