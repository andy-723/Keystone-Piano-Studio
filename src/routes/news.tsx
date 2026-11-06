import { createFileRoute } from "@tanstack/react-router";
import { StudioNews } from "@/components/StudioNews";
import { announcementsQuery, newsOptionsQuery } from "@/lib/news-queries";
export const Route = createFileRoute("/news")({
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(announcementsQuery()),context.queryClient.ensureQueryData(newsOptionsQuery())]),
  head: () => ({ meta: [{ title: "Studio news — Keystone Music HQ" }, { name: "description", content: "Write studio updates and share news with every family." }, { property: "og:title", content: "Studio news — Keystone Music HQ" }, { property: "og:description", content: "Studio announcements for students and their families." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: StudioNews,
});