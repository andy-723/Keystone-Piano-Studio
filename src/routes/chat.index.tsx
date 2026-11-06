import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/chat/")({
  head: () => ({ meta: [
    { title: "Family chat — Keystone Music HQ" }, { name: "description", content: "Family conversations, practice photos and piano lesson summaries at Keystone Music HQ." },
    { property: "og:title", content: "Family chat — Keystone Music HQ" }, { property: "og:description", content: "Family conversations, practice photos and piano lesson summaries at Keystone Music HQ." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <div className="hidden min-w-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center md:flex"><MessageCircle className="size-12 text-muted-foreground" aria-hidden /><p className="text-xl">Select a family conversation</p></div>,
});