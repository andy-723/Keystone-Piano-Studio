import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/students")({
  head: () => ({
    meta: [
      { title: "Students — Opus" },
      { name: "description", content: "Clarke Piano Studio students, learning progress and family check-ins." },
      { property: "og:title", content: "Students — Opus" },
      { property: "og:description", content: "Clarke Piano Studio students, learning progress and family check-ins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Outlet,
});
