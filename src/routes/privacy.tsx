import { createFileRoute } from "@tanstack/react-router";
import { LegalMarkdown, PublicPage } from "@/components/public/PublicPage";
import { PUBLIC_PRIVACY_MARKDOWN } from "@/lib/public-legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy — Keystone Music HQ" }] }),
  component: () => (
    <PublicPage title="Privacy notice">
      <LegalMarkdown markdown={PUBLIC_PRIVACY_MARKDOWN} />
    </PublicPage>
  ),
});
