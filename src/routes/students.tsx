import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/students")({
  head: () => ({
    meta: [
      { title: "Students — KeyStone Piano Studios" },
      { name: "description", content: "KeyStone Piano Studios students, learning progress and family check-ins." },
      { property: "og:title", content: "Students — KeyStone Piano Studios" },
      { property: "og:description", content: "KeyStone Piano Studios students, learning progress and family check-ins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Outlet,
});
