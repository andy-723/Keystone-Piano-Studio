import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getAuthClient } from "@/lib/auth-client";
import { finishGoogleConnectFn } from "@/server/calendar";

/** Google sends the teacher back here after they allow calendar access. */
export const Route = createFileRoute("/calendar/google")({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s["code"] === "string" ? s["code"] : undefined,
    state: typeof s["state"] === "string" ? s["state"] : undefined,
    error: typeof s["error"] === "string" ? s["error"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Connecting Google Calendar — Keystone Music HQ" }] }),
  component: GoogleCallback,
});

function GoogleCallback() {
  const { code, state, error } = Route.useSearch();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    error
      ? {
          ok: false,
          message:
            error === "access_denied"
              ? "Google Calendar wasn't connected because access was declined."
              : "Google couldn't finish connecting.",
        }
      : null,
  );
  const started = useRef(false);

  useEffect(() => {
    if (error || started.current) return;
    started.current = true;
    if (!code || !state) {
      setResult({ ok: false, message: "This link is incomplete. Start again from the Calendar." });
      return;
    }
    // Drop the one-time code from the address bar and history.
    window.history.replaceState(null, "", "/calendar/google");
    void (async () => {
      try {
        const { data } = (await getAuthClient()?.auth.getSession()) ?? { data: { session: null } };
        const accessToken = data.session?.access_token ?? "";
        const done = await finishGoogleConnectFn({ data: { accessToken, code, state } });
        const total = done.synced + done.error;
        setResult({
          ok: true,
          message: `Connected${done.email ? ` to ${done.email}` : ""}. ${total ? `${done.synced} of ${total} weekly or one-off lessons sent to the "Keystone lessons" calendar.` : 'Lessons you add will appear in the "Keystone lessons" calendar.'}`,
        });
      } catch (e) {
        setResult({
          ok: false,
          message: e instanceof Error ? e.message : "Google couldn't finish connecting.",
        });
      }
    })();
  }, [code, state, error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="text-3xl font-semibold">Google Calendar</h1>
      <p role="status" className={`mt-4 text-lg ${result && !result.ok ? "text-destructive" : ""}`}>
        {result ? result.message : "Connecting your Google Calendar…"}
      </p>
      {result && (
        <Link to="/calendar" search={{}} className="mt-6 inline-block text-lg underline">
          Back to the calendar
        </Link>
      )}
    </div>
  );
}
