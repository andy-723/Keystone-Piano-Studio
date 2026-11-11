import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "@/components/public/PublicPage";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About us — Keystone Music HQ" },
      { name: "description", content: "Keystone Music HQ is an Australian studio OS for independent music teachers: lessons, families, billing and progress in one calm place." },
      { property: "og:title", content: "About us — Keystone Music HQ" },
      { property: "og:description", content: "Why we built Keystone Music HQ for Australian music studios." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <PublicPage
      eyebrow="ABOUT US"
      title="Built for the studio, not the spreadsheet"
      intro="Keystone Music HQ brings lessons, families, billing and student progress into one calm place, so teachers can spend more time teaching."
    >
      <div className="space-y-8 text-mk-ink/80">
        <section>
          <h2 className="font-mk-serif text-3xl text-mk-ink">Why we exist</h2>
          <p className="mt-3">
            Independent music teachers run a small business on top of teaching: timetables, make-ups,
            invoices, GST, practice and parent messages. Too often that lives across texts, notebooks
            and spreadsheets. Keystone keeps it together, in one day-book designed for how studios
            actually work.
          </p>
        </section>
        <section>
          <h2 className="font-mk-serif text-3xl text-mk-ink">What we care about</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 marker:text-mk-gold">
            <li><strong>Families first.</strong> Parents see what they need, in English or 中文, and nothing private.</li>
            <li><strong>Australian by default.</strong> AUD, GST, state term calendars and data hosted in Sydney.</li>
            <li><strong>Calm and readable.</strong> Large text, clear buttons and no clutter.</li>
            <li><strong>Invite-only.</strong> Every studio is set up personally by the Keystone team.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-mk-serif text-3xl text-mk-ink">Who we are</h2>
          <p className="mt-3">
            Keystone Music HQ is built in Australia by Synoratech Pty Ltd. Want to know more or bring your
            studio across?{" "}
            <Link to="/contact" search={{ topic: "studio" }} className="text-mk-bronze underline underline-offset-2">
              Request a studio
            </Link>
            .
          </p>
        </section>
      </div>
    </PublicPage>
  );
}
