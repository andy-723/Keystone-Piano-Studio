import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * keystonemusichq.com/ is the public front door: everyone lands on the welcome page, signed in
 * or not, and the server answers with a redirect so search engines and link previews see the
 * welcome page too. The teacher's day-book lives at /today. Old "/?date=…" day-book links
 * still go to that day.
 */
export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { date?: string } =>
    typeof s["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["date"])
      ? { date: s["date"] }
      : {},
  beforeLoad: ({ search }) => {
    if (search.date) throw redirect({ to: "/today", search: { date: search.date }, replace: true });
    throw redirect({ to: "/welcome", replace: true });
  },
});
