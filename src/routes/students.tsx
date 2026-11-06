import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/students")({
  head: () => ({
    meta: [
      { title: "Students — Keystone Music HQ" },
      { name: "description", content: "Keystone Music HQ students, learning progress and family check-ins." },
      { property: "og:title", content: "Students — Keystone Music HQ" },
      { property: "og:description", content: "Keystone Music HQ students, learning progress and family check-ins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Outlet,
});
