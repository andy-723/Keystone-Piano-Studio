import { createFileRoute } from "@tanstack/react-router";
import { PublicPage, publicSupportEmail } from "@/components/public/PublicPage";
import { SupportRequestForm } from "@/components/help/SupportRequestForm";
import { KEYSTONE_PRIVACY_EMAIL } from "@/mocks/keystone-app-terms";

type ContactSearch = { topic?: "studio"; plan?: string };

const PLANS = ["Base", "Pro", "Base or Pro"];

export const Route = createFileRoute("/contact")({
  validateSearch: (search: Record<string, unknown>): ContactSearch => {
    const out: ContactSearch = {};
    if (search["topic"] === "studio") out.topic = "studio";
    const plan = search["plan"];
    if (typeof plan === "string" && PLANS.includes(plan)) out.plan = plan;
    return out;
  },
  head: () => ({ meta: [{ title: "Contact us — Keystone Music HQ" }] }),
  component: ContactPage,
});

/**
 * Public Contact us page. "Request a studio" on /welcome and /pricing lands here with the
 * new-studio topic preselected. Messages go through the same support request path as /help
 * (Turnstile check, rate limit, support_request record, email to SUPPORT_EMAIL, acknowledgement).
 */
function ContactPage() {
  const search = Route.useSearch();
  const studio = search.topic === "studio";
  const support = publicSupportEmail();

  return (
    <PublicPage title="Contact us">
      <p>
        Studio accounts are set up by the Keystone team; there is no self-sign-up yet. Tell us a
        little about your studio and we'll reply by email, usually within one business day.
      </p>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Studios, plans and support:{" "}
          <a className="text-[#604A19] underline underline-offset-2" href={`mailto:${support}`}>
            {support}
          </a>
        </li>
        <li>
          Privacy questions:{" "}
          <a
            className="text-[#604A19] underline underline-offset-2"
            href={`mailto:${KEYSTONE_PRIVACY_EMAIL}`}
          >
            {KEYSTONE_PRIVACY_EMAIL}
          </a>
        </li>
        <li>
          Families with questions about lessons, fees or progress: please message your studio
          directly in the app.
        </li>
      </ul>
      <section aria-labelledby="contact-form" className="pt-4">
        <h2 id="contact-form" className="font-serif text-2xl font-semibold">
          Send us a message
        </h2>
        <SupportRequestForm
          audience="studio"
          lang="en"
          mode="public"
          supportEmail={support}
          initialCategory={studio ? "new_studio" : undefined}
          initialSubject={
            studio ? `Request a studio${search.plan ? ` (${search.plan})` : ""}` : undefined
          }
        />
      </section>
    </PublicPage>
  );
}
