import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/AppShell";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Opus" },
      { name: "description", content: "Term invoicing is coming soon." },
      { property: "og:title", content: "Invoices — Opus" },
      { property: "og:description", content: "Term invoicing is coming soon." },
    ],
  }),
  component: () => <ComingSoon title="Invoices" note="Term invoicing is coming soon." />,
});
