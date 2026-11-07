import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
  head: () => ({ meta: [{ title: "Sign in — Keystone Music HQ" }] }),
});

function AuthCallbackPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[hsl(40_33%_96%)] px-4">
      <h1 className="text-3xl font-semibold">Family sign-in</h1>
      <p className="mt-3 max-w-md text-center text-base text-muted-foreground">
        In live mode, Supabase Auth completes the magic link here and links your account to the
        guardian email. Mock mode has no passwords (ADR-018).
      </p>
      <Button className="mt-6" asChild>
        <a href="/">Continue</a>
      </Button>
    </div>
  );
}
