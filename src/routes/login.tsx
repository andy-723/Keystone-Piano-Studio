import { createFileRoute } from "@tanstack/react-router";
import { LoginCard } from "@/components/login/LoginCard";
import { LoginLayout } from "@/components/login/LoginLayout";
import { safeNextPath } from "@/lib/auth-paths";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search["next"] === "string" ? search["next"] : undefined,
    reason: typeof search["reason"] === "string" ? search["reason"] : undefined,
  }),
  component: LoginPage,
  head: () => ({
    meta: [{ title: "Sign in — Keystone Music HQ" }],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap",
      },
    ],
  }),
});

function LoginPage() {
  const { next, reason } = Route.useSearch();
  const nextPath = safeNextPath(next);
  const siteKey =
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.["VITE_TURNSTILE_SITE_KEY"] as string | undefined)) ||
    "";

  return (
    <LoginLayout>
      <LoginCard
        nextPath={nextPath}
        siteKey={siteKey}
        sessionTimedOut={reason === "session_timeout"}
      />
    </LoginLayout>
  );
}
