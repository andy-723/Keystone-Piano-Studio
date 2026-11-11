import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/server/env";
import { unsubscribe } from "@/server/notifications";
import { escapeHtml } from "@/server/email/templates/notification";

/**
 * Unsubscribe link in notification emails. GET shows a confirm button (link scanners open GET
 * links, so GET never changes anything). POST turns the emails off; mail apps' one-click
 * unsubscribe (RFC 8058, List-Unsubscribe-Post) also POSTs here.
 */
const LABEL: Record<string, string> = {
  chat: "chat message emails",
  news: "news emails",
  marking: "teacher feedback emails",
  summary: "daily update emails",
  all: "all notification emails",
};

const ALL_LABEL = "all notification emails";

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#F5EBD6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#15100D"><main style="max-width:480px;margin:48px auto;background:#FFFFFF;border-top:3px solid #C2A259;border-radius:10px;padding:32px"><h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}</main></body></html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    },
  );
}

export const Route = createFileRoute("/api/notifications/unsubscribe")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        const kind = url.searchParams.get("k") ?? "all";
        const label = LABEL[kind] ?? ALL_LABEL;
        return page(
          "Turn off emails?",
          `<p style="line-height:1.5">Stop ${escapeHtml(label)} from Keystone Music HQ? You'll still see everything in the app.</p><form method="post" action="/api/notifications/unsubscribe?t=${encodeURIComponent(token)}&k=${encodeURIComponent(kind)}"><button type="submit" style="min-height:44px;padding:0 24px;background:#604A19;color:#FBF7EE;border:0;border-radius:6px;font-size:16px;font-weight:600;cursor:pointer">Turn them off</button></form>`,
        );
      },
      POST: async ({ request }) => {
        // Only the query string matters; refuse anything with a real body.
        if (Number(request.headers.get("content-length") ?? "0") > 4096) {
          return new Response("Payload too large", { status: 413 });
        }
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        const kind = url.searchParams.get("k") ?? "all";
        let ok = false;
        try {
          ok = await unsubscribe(token, kind);
        } catch (error) {
          console.error("unsubscribe failed", error instanceof Error ? error.message : error);
        }
        const appUrl = getServerEnv().appUrl;
        return ok
          ? page(
              "Done",
              `<p style="line-height:1.5">We've turned off ${escapeHtml(LABEL[kind] ?? ALL_LABEL)}. You can turn them back on any time under <a href="${escapeHtml(appUrl)}/settings" style="color:#604A19">Settings</a> in Keystone.</p>`,
            )
          : page(
              "That link didn't work",
              `<p style="line-height:1.5">It may be old. Sign in to Keystone and change your email settings there.</p>`,
            );
      },
    },
  },
});
