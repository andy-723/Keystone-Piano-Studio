import { createFileRoute } from "@tanstack/react-router";
import { StudioTermsSettings } from "@/components/StudioTermsSettings";

export const Route = createFileRoute("/settings/terms")({
  head: () => ({
    meta: [
      { title: "Studio terms — Keystone Music HQ" },
      { name: "description", content: "Publish and track Keystone Music HQ studio terms and family acceptances." },
    ],
  }),
  component: StudioTermsSettings,
});
