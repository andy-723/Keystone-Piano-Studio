import { createFileRoute } from "@tanstack/react-router";
import { LessonCalendar } from "@/components/LessonCalendar";

export const Route = createFileRoute("/calendar/")({
  validateSearch: (s: Record<string, unknown>): { date?: string } =>
    typeof s["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["date"])
      ? { date: s["date"] }
      : {},
  head: () => ({
    meta: [
      { title: "Calendar — Keystone Music HQ" },
      {
        name: "description",
        content:
          "Give students weekly or one-off lesson times and keep Google Calendar up to date.",
      },
    ],
  }),
  errorComponent: () => (
    <p role="alert">The calendar could not be opened. Please refresh to try again.</p>
  ),
  component: CalendarPage,
});

function CalendarPage() {
  const { date = "" } = Route.useSearch();
  return <LessonCalendar date={date} />;
}
