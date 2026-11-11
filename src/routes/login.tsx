import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { HomeLogoLink } from "@/components/HomeLogoLink";
import { LoginCard } from "@/components/login/LoginCard";
import { safeNextPath } from "@/lib/auth-paths";

const StreetScene = lazy(() =>
  import("@/components/login/StreetScene").then((m) => ({ default: m.StreetScene })),
);

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search["next"] === "string" ? search["next"] : undefined,
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
  const { next } = Route.useSearch();
  const nextPath = safeNextPath(next);
  const siteKey =
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.["VITE_TURNSTILE_SITE_KEY"] as string | undefined)) ||
    "";

  return (
    <main
      // Full-screen split on wide screens. Below 860px the page stacks (scene, then card) and must
      // grow and scroll naturally: never set a fixed height inline here, because an inline height
      // beats the max-[860px] classes and clipped the card on phones (Continue button unreachable).
      className="relative h-dvh min-h-[640px] overflow-hidden bg-[#F5EBD6] text-[#15100D] max-[860px]:h-auto max-[860px]:min-h-dvh max-[860px]:overflow-visible"
      style={{
        ["--font-login-serif" as string]: "'Source Serif 4', Georgia, serif",
      }}
    >
      <Suspense
        fallback={
          <div className="absolute inset-0 bg-[#2B241F] max-[860px]:relative max-[860px]:h-[340px]" />
        }
      >
        <StreetScene />
      </Suspense>

      <div
        className="pointer-events-none absolute inset-[14px] z-[1] border border-[rgba(194,162,89,0.55)] outline outline-1 outline-offset-[5px] outline-[rgba(194,162,89,0.3)] max-[860px]:hidden"
        aria-hidden
      />

      {/* Logo goes to the public welcome page (never the demo app), or the studio if signed in. */}
      <HomeLogoLink className="absolute left-6 top-6 z-[3] block rounded-xl bg-[rgba(251,247,238,0.92)] px-3.5 py-2.5">
        <BrandLogo variant="horizontal" alt="Keystone Music HQ" />
      </HomeLogoLink>

      <aside className="absolute right-[5%] top-1/2 z-[2] flex max-h-[calc(100%-48px)] w-[32%] overflow-y-auto min-w-[380px] max-w-[460px] -translate-y-1/2 justify-center rounded-[22px] border border-[#D9C79E] bg-[#FBF7EE] px-9 py-10 shadow-[0_24px_60px_rgba(0,0,0,0.45),inset_0_0_0_6px_#FBF7EE,inset_0_0_0_7px_#E3D3AE] max-[860px]:relative max-[860px]:right-auto max-[860px]:top-auto max-[860px]:mx-3 max-[860px]:mt-[-36px] max-[860px]:mb-6 max-[860px]:w-auto max-[860px]:min-w-0 max-[860px]:max-w-none max-[860px]:max-h-none max-[860px]:translate-y-0 max-[860px]:overflow-visible max-[860px]:px-5 max-[860px]:py-7">
        <LoginCard nextPath={nextPath} siteKey={siteKey} />
      </aside>
    </main>
  );
}
