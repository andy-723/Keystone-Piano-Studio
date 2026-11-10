import { createFileRoute } from "@tanstack/react-router";
import { HelpCentre } from "@/components/help/HelpCentre";
import { publicSupportEmail } from "@/components/public/PublicPage";
import { isLiveAuthConfigured } from "@/lib/auth-client";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "Help — Keystone Music HQ" }] }),
  component: SupportPage,
});

/** In-app help centre for studio owners, admins and teachers (inside the app shell). */
function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold">Help centre</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Search the answers below first. If you're still stuck, send us a request at the bottom of
        the page.
      </p>
      <div className="mt-6">
        <HelpCentre
          audience="studio"
          mode={isLiveAuthConfigured() ? "live" : "demo"}
          supportEmail={publicSupportEmail()}
        />
      </div>
    </div>
  );
}
