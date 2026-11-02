import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/AppShell";

export const Route = createFileRoute("/students")({
  head: () => ({
    meta: [
      { title: "Students — Opus" },
      { name: "description", content: "Your roster with Red Risk badges is coming soon." },
      { property: "og:title", content: "Students — Opus" },
      { property: "og:description", content: "Your roster with Red Risk badges is coming soon." },
    ],
  }),
  component: () => <ComingSoon title="Students" note="Your roster with Red Risk badges is coming soon." />,
});
