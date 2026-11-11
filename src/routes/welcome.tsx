import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import hero from "@/assets/welcome-hero.jpg";
import { FinanceShowcase, marketingFinanceQuery } from "@/components/FinanceShowcase";
import { MarketingMotion } from "@/components/MarketingMotion";
import teachingMoment from "@/assets/keystone-teaching-moment.jpg";
import logo from "@/assets/keystone-logo.jpg";
import { ArrowRight, Lock, MapPin, MailOpen, FileSignature, BookOpen, Receipt, Clock, Wallet, Car, ArrowDownToLine } from "lucide-react";

const SIGN_IN = "https://keystonemusichq.com/login";
const ENQUIRE = "mailto:support@keystonemusichq.com?subject=Request%20a%20studio";

export const Route = createFileRoute("/welcome")({
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingFinanceQuery),
  head: () => ({
    meta: [
      { title: "Keystone Music HQ — Studio Snapshot & Tax Lite" },
      { name: "description", content: "Studio Snapshot for your teaching week. Tax Lite for EOFY. Explore the calm finance and operations workspace for independent Australian music studios." },
      { property: "og:title", content: "Keystone Music HQ — Studio Snapshot & Tax Lite" },
      { property: "og:description", content: "Unpaid, unenrolled, not practising — one calm studio view. Discover Studio Snapshot and planned Tax Lite tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

const serif = "font-mk-serif";

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-3 text-base font-medium uppercase tracking-[0.18em] text-mk-bronze">
      <span className="h-px w-10 bg-mk-gold" aria-hidden />{children}
    </p>
  );
}

function PrimaryCta({ className = "" }: { className?: string }) {
  return <Button asChild size="lg" className={`group bg-mk-bronze text-mk-paper shadow-none hover:bg-mk-ink ${className}`}><a href={ENQUIRE}>Request a studio <ArrowRight aria-hidden className="transition-transform group-hover:translate-x-1" /></a></Button>;
}

const taxFeatures = [
  { Icon: Receipt, title: "Books and exam fees, passed on properly", body: "Log an AMEB book or exam fee, then pass it to the student’s next invoice as a reimbursement — not fake tuition profit." },
  { Icon: Wallet, title: "Gross tuition. Stripe fees. No guesswork.", body: "See what families paid and what processing cost, year to date and across the Australian financial year: 1 July to 30 June." },
  { Icon: Clock, title: "Home-studio hours, in one place", body: "Teaching and admin hours from the calendar, with an illustrative 70¢/hr home-office estimate. Check the applicable ATO rate and eligibility." },
  { Icon: Car, title: "Mobile teaching, minus the paperwork", body: "An optional kilometre log and cents-per-kilometre estimate. Simple travel records, not a full logbook product." },
  { Icon: ArrowDownToLine, title: "One EOFY pack, ready to review", body: "Export gross tuition, fees, expenses and home-office hours as CSV for your tax agent or cash-basis myTax preparation." },
];

function Welcome() {
  return (
    <MarketingMotion><div className="min-h-screen bg-mk-cream font-mk-sans text-mk-ink antialiased">
      {/* Hero */}
      <section className="relative isolate flex min-h-[min(760px,88svh)] flex-col overflow-hidden bg-mk-ink text-mk-paper">
        <img src={hero} alt="Grand piano on an Art Deco stage under a gold sunburst" width={1600} height={1008} className="mk-stage-image absolute inset-0 -z-10 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-mk-ink/90 via-mk-ink/60 to-mk-ink/10" aria-hidden />
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 md:px-10">
          <Link to="/welcome" className="shrink-0 rounded-lg bg-mk-paper px-3 py-1.5"><img src={logo} alt="Keystone Music HQ" className="h-10 w-auto max-w-[120px] sm:max-w-[180px]" /></Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" className="px-2 text-mk-paper hover:bg-mk-paper/10 hover:text-mk-paper"><Link to="/pricing">Pricing</Link></Button>
            <a href="#enrolment" className="hidden min-h-12 items-center px-4 text-base text-mk-paper/85 hover:text-mk-paper md:inline-flex">How it works</a>
            <a href="#trust" className="hidden min-h-12 items-center px-4 text-base text-mk-paper/85 hover:text-mk-paper md:inline-flex">Trust</a>
            <Button asChild variant="ghost" className="border border-mk-paper/40 px-3 text-mk-paper hover:bg-mk-paper/10 hover:text-mk-paper"><a href={SIGN_IN}>Sign in</a></Button>
          </nav>
        </header>
        <div id="top" className="mx-auto flex w-full max-w-7xl flex-1 items-center px-5 pb-12 pt-6 md:px-10">
          <div className="mk-hero-copy max-w-3xl">
            <p className="font-mk-serif text-3xl font-semibold text-mk-paper">Keystone Music HQ</p>
            <h1 className={`${serif} mt-5 text-4xl font-semibold leading-[1.12] md:text-6xl`}>
              See the studio week — <em className="font-normal italic">money, roll and practice.</em>
            </h1>
            <p className="mt-6 max-w-xl text-xl leading-relaxed text-mk-paper/85">
              Snapshot for the teaching week. Tax Lite for EOFY. Not another spreadsheet or a second ledger.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <PrimaryCta className="bg-mk-paper text-mk-ink hover:bg-mk-cream" />
              <Button asChild variant="ghost" size="lg" className="text-mk-paper underline decoration-mk-gold underline-offset-8 hover:bg-mk-paper/10 hover:text-mk-paper"><a href={SIGN_IN}>Sign in</a></Button>
            </div>
          </div>
        </div>
      </section>

      <main>
      <section aria-labelledby="snapshot-title" className="bg-mk-paper">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
          <Eyebrow>Studio Snapshot</Eyebrow>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
            <h2 id="snapshot-title" className="font-mk-serif text-3xl font-semibold leading-tight md:text-4xl">Unpaid, unenrolled, not practising.<br /><em className="font-normal">One calm screen.</em></h2>
            <p className="text-lg leading-relaxed text-mk-ink/75">What came in. Who needs a follow-up. How the teaching week went. A studio snapshot, not another spreadsheet — designed for solo owners, with room to grow.</p>
          </div>
          <FinanceShowcase mode="snapshot" />
          <p className="mt-5 text-base text-mk-ink/70">Lists when you need detail. CSV when you need your own notes. Studio-wide finances for owners and admins; teachers keep their own caseload.</p>
        </div>
      </section>

      <section aria-labelledby="tax-title" className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
        <Eyebrow>Tax Lite · planned</Eyebrow>
        <h2 id="tax-title" className="mt-4 max-w-3xl font-mk-serif text-3xl font-semibold leading-tight md:text-4xl">EOFY without rebuilding<br />the year in a spreadsheet.</h2>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-mk-ink/75">Studio-specific numbers before you ever open Xero. For solo teachers preparing cash-basis myTax records: gross tuition, merchant fees and home-studio hours, together.</p>
        <div className="mt-6 grid min-w-0 gap-8 xl:grid-cols-2 xl:gap-12">
          <FinanceShowcase mode="tax" />
          <dl className="divide-y divide-mk-gold/50">{taxFeatures.map(({ Icon, title, body }) => <div key={title} className="grid grid-cols-[2rem_1fr] gap-x-4 py-5"><Icon aria-hidden className="mt-1 size-6 text-mk-bronze" /><dt className="font-mk-serif text-2xl font-semibold">{title}</dt><dd className="col-start-2 mt-2 text-lg leading-relaxed text-mk-ink/75">{body}</dd></div>)}</dl>
        </div>
        <p className="mt-7 max-w-4xl border-t border-mk-gold/50 pt-5 text-base text-mk-ink/70">Tax Lite is record preparation, not a general ledger or tax lodgement. Rent, utilities and bank feeds stay in Xero when you grow; Keystone doesn’t replace your accountant. Estimates are illustrative, not ATO advice.</p>
      </section>

      {/* How enrolment works */}
      <section id="enrolment" className="bg-mk-paper">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
          <Eyebrow>How enrolment works</Eyebrow>
          <h2 className={`${serif} mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl`}>From invite to first lesson in three steps.</h2>
          <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-0">
            {[
              ["Invite", "Your studio sends a branded invite — no public sign-up wall."],
              ["Enrol", "A guided form, one question at a time. Terms accepted properly, with a typed name."],
              ["Teach", "The student appears on your roll with chat, practice and invoicing ready."],
            ].map(([t, b], i) => (
              <li key={t} className="relative md:border-l md:border-mk-gold/60 md:px-10 first:md:border-l-0 first:md:pl-0">
                <span className="mk-step-icon inline-flex size-16 items-center justify-center rounded-lg border border-mk-gold/60 bg-mk-cream text-mk-bronze" aria-hidden>{i === 0 ? <MailOpen className="size-8" /> : i === 1 ? <FileSignature className="size-8" /> : <BookOpen className="size-8" />}</span>
                <h3 className={`${serif} mt-4 text-3xl font-semibold`}>{t}</h3>
                <p className="mt-3 text-lg leading-relaxed text-mk-ink/75">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div><Eyebrow>Pro · room to grow</Eyebrow><h2 className="mt-4 font-mk-serif text-3xl font-semibold leading-tight md:text-4xl">Know prepaid fees vs lessons you’ve actually delivered.</h2><p className="mt-5 text-lg leading-relaxed text-mk-ink/75">For growing and multi-teacher studios: a planned CFO view of margin after teacher splits, prepaid tuition, churn and make-up radar, Xero queues and contractor payouts.</p><p className="mt-4 text-lg text-mk-ink/75">Approaching the $75,000 GST turnover threshold? Explore a calm path to Xero-ready Pro. Your registration obligations are separate from your plan.</p><Button asChild variant="ghost" className="mt-5 text-mk-bronze hover:bg-mk-paper"><Link to="/pricing">Compare Base and Pro <ArrowRight aria-hidden /></Link></Button></div>
          <figure data-reveal className="overflow-hidden rounded-lg"><img src={teachingMoment} alt="A piano teacher and student working through music with a tablet beside the piano" loading="lazy" width={1536} height={1024} className="aspect-[4/3] w-full object-cover" /><figcaption className="mt-3 text-base text-mk-ink/70">Less time piecing together numbers. More time teaching.</figcaption></figure>
        </div>
      </section>
      <section className="border-t border-mk-gold/50 bg-mk-paper"><div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 md:grid-cols-2 md:px-10"><h2 className="font-mk-serif text-3xl font-semibold">The music stays at the centre.</h2><p className="text-lg leading-relaxed text-mk-ink/75">Lessons, practice and chat beside the student. Native invoices and guided enrolment. For families: a clear invite, one-question enrolment, agreements they understand and a direct connection to their teacher.</p></div></section>
      {/* Trust */}
      <section id="trust" className="bg-mk-ink text-mk-paper">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
          <p className="flex items-center gap-3 text-base font-medium uppercase tracking-[0.18em] text-mk-gold"><span className="h-px w-10 bg-mk-gold" aria-hidden />Trust, quietly built in</p>
          <h2 className={`${serif} mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl`}>Student records deserve care.</h2>
          <div className="mt-14 grid gap-px overflow-hidden rounded-lg bg-mk-gold/30 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [MapPin, "Australian made, hosted in Sydney", "Designed for a Sydney-hosted workspace, with student privacy at its heart."],
              [Lock, "Staff two-step sign-in", "Planned passwordless sign-in with Google, Microsoft or email link, plus staff MFA."],
              [MailOpen, "Invite-only", "Accounts start from a teacher or Keystone — never an open sign-up."],
              [FileSignature, "Agreements on record", "Clear terms, guardian rules for minors and receipts of acceptance."],
            ].map(([Icon, t, b]) => {
              const I = Icon as typeof Lock;
              return (
                <div key={t as string} className="bg-mk-ink p-8">
                  <I className="h-7 w-7 text-mk-gold" aria-hidden />
                  <h3 className={`${serif} mt-5 text-2xl font-semibold`}>{t as string}</h3>
                  <p className="mt-2 text-lg leading-relaxed text-mk-paper/75">{b as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-4xl px-5 py-28 text-center">
        <div className="mx-auto mb-8 h-px w-24 bg-mk-gold" aria-hidden />
        <h2 className={`${serif} text-4xl font-semibold leading-tight md:text-6xl`}>Bring your studio to Keystone.</h2>
        <p className="mx-auto mt-5 max-w-xl text-xl leading-relaxed text-mk-ink/75">Keystone is invite-only. Tell us about your studio and we'll set you up personally.</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <PrimaryCta />
          <Button asChild variant="ghost" size="lg" className="border border-mk-ink/25 text-mk-ink hover:bg-mk-paper"><a href={SIGN_IN}>Sign in</a></Button>
        </div>
      </section>

      </main>
      <footer className="border-t border-mk-gold/50 bg-mk-paper">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-base text-mk-ink/70 md:px-10">
          <p>© 2026 Synoratech Pty Ltd · Keystone Music HQ</p>
          <nav className="flex flex-wrap gap-6">
            <Link to="/pricing" className="hover:text-mk-ink">Pricing</Link>
            <a href="mailto:support@keystonemusichq.com" className="hover:text-mk-ink">Help</a>
            <span>Marketing preview · no live payments or tax filing</span>
            <span>Data hosted in Sydney, Australia</span>
          </nav>
        </div>
      </footer>
    </div></MarketingMotion>
  );
}
