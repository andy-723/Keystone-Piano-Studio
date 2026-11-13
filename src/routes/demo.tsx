import { createFileRoute } from "@tanstack/react-router";
import { DemoLoginCard } from "@/components/login/DemoLoginCard";
import { LoginLayout } from "@/components/login/LoginLayout";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
  head: () => ({
    meta: [{ title: "Demo studio — Keystone Music HQ" }, { name: "robots", content: "noindex" }],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap",
      },
    ],
  }),
});

function DemoPage() {
  const siteKey =
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.["VITE_TURNSTILE_SITE_KEY"] as string | undefined)) ||
    "";
  return (
    <LoginLayout>
      <DemoLoginCard siteKey={siteKey} />
    </LoginLayout>
  );
}
