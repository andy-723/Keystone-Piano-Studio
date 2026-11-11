import { createFileRoute } from "@tanstack/react-router";
import { LegalMarkdown, PublicPage } from "@/components/public/PublicPage";
import { PUBLIC_DISCLAIMER_MARKDOWN } from "@/lib/public-legal";

export const Route = createFileRoute("/disclaimer")({
  head: () => ({ meta: [{ title: "Website terms and disclaimer — Keystone Music HQ" }] }),
  component: () => (
    <PublicPage title="Website terms and disclaimer">
      <LegalMarkdown markdown={PUBLIC_DISCLAIMER_MARKDOWN} />
    </PublicPage>
  ),
});
