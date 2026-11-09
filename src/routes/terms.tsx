import { createFileRoute } from "@tanstack/react-router";
import { LegalMarkdown, PublicPage } from "@/components/public/PublicPage";
import { PUBLIC_TERMS_MARKDOWN } from "@/lib/public-legal";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of use — Keystone Music HQ" }] }),
  component: () => (
    <PublicPage title="Terms of use">
      <LegalMarkdown markdown={PUBLIC_TERMS_MARKDOWN} />
    </PublicPage>
  ),
});
