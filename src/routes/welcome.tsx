import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import hero from "@/assets/welcome-hero.jpg";
import { marketingFinanceQuery } from "@/components/FinanceShowcase";
import { StudioShowcase } from "@/components/StudioShowcase";
import { MarketingMotion } from "@/components/MarketingMotion";
import teachingMoment from "@/assets/keystone-teaching-moment.jpg";
import { MarketingNavbar } from "@/components/MarketingNavbar";
import { MarketingFooter } from "@/components/MarketingFooter";
import { ZoomHero } from "@/components/ZoomHero";
import { FounderVideo } from "@/components/FounderVideo";
import {
  ArrowRight,
  Lock,
  MapPin,
  MailOpen,
  FileSignature,
  BookOpen,
  Receipt,
  Clock,
  Wallet,
  Car,
  ArrowDownToLine,
  CalendarDays,
  MessageCircle,
  LayoutDashboard,
} from "lucide-react";
import { marketingHomeHead } from "@/lib/marketing-seo";

const SIGN_IN = "/login";
const ENQUIRE = "/contact?topic=studio";

export const Route = createFileRoute("/welcome")({
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingFinanceQuery),
  head: () => marketingHomeHead(),
  component: Welcome,
});

const serif = "font-mk-serif";

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-3 text-base font-medium uppercase tracking-[0.18em] text-mk-bronze">
      <span className="h-px w-10 bg-mk-gold" aria-hidden />
      {children}
    </p>
  );
}

function PrimaryCta({ className = "" }: { className?: string }) {
  return (
    <Button
      asChild
      size="lg"
      className={`group bg-mk-bronze text-mk-paper shadow-none hover:bg-mk-ink ${className}`}
    >
      <a href={ENQUIRE}>
        Request a studio{" "}
        <ArrowRight aria-hidden className="transition-transform group-hover:translate-x-1" />
      </a>
    </Button>
  );
}

const taxFeatures = [
  {
    Icon: Receipt,
    title: "Books and exam fees, passed on properly",
    body: "Log an AMEB book or exam fee, then add it to the family’s next invoice. The charge is recorded as income and your cost as an expense, so they offset.",
  },
  {
    Icon: Wallet,
    title: "Gross tuition. Stripe fees. No guesswork.",
    body: "See what families paid and what processing cost, year to date and across the Australian financial year: 1 July to 30 June.",
  },
  {
    Icon: Clock,
    title: "Home-studio hours, in one place",
    body: "Scheduled lessons are pre-filled from the calendar; you confirm the hours you actually worked from home and add admin time as you go. Illustrative 70¢/hr fixed-rate estimate.",
  },
  {
    Icon: Car,
    title: "Mobile teaching, minus the paperwork",
    body: "An optional kilometre log and cents-per-kilometre estimate. Simple travel records, not a full logbook product.",
  },
  {
    Icon: ArrowDownToLine,
    title: "One EOFY pack, ready to review",
    body: "Export gross tuition, fees, expenses and home-office hours as CSV for your tax agent or cash-basis myTax preparation.",
  },
];

function Welcome() {
  return (
    <MarketingMotion>
      <div className="min-h-screen bg-mk-cream font-mk-sans text-mk-ink antialiased">
        {/* Hero */}
        <ZoomHero
          image={hero}
          alt="Grand piano on an Art Deco stage under a gold sunburst"
          overlay={
            <div className="h-full w-full bg-gradient-to-r from-mk-ink/95 via-mk-ink/80 to-mk-ink/30" />
          }
          nav={<MarketingNavbar />}
        >
          <div
            id="top"
            className="mx-auto flex w-full max-w-7xl flex-1 items-center px-5 pb-12 pt-6 md:px-10"
          >
            <div className="mk-hero-copy max-w-3xl">
              <p className="font-mk-serif text-3xl font-semibold text-mk-paper">
                Keystone Music HQ
              </p>
              <h1 className={`${serif} mt-5 text-4xl font-semibold leading-[1.12] md:text-6xl`}>
                See the studio week —{" "}
                <em className="font-normal italic">money, roll and practice.</em>
              </h1>
              <p className="mt-6 max-w-xl text-xl leading-relaxed text-mk-paper/85">
                “Less Paperwork, More Passion – Your Studio, Unified”
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <PrimaryCta className="bg-mk-paper text-mk-ink hover:bg-mk-cream" />
                <Button
                  asChild
                  variant="ghost"
                  size="lg"
                  className="text-mk-paper underline decoration-mk-gold underline-offset-8 hover:bg-mk-paper/10 hover:text-mk-paper"
                >
                  <a href={SIGN_IN}>Sign in</a>
                </Button>
              </div>
            </div>
          </div>
        </ZoomHero>

        <main>
          <FounderVideo />
          <section aria-labelledby="snapshot-title" className="bg-mk-paper">
            <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
              <Eyebrow>A look inside Keystone</Eyebrow>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
                <h2
                  id="snapshot-title"
                  className="font-mk-serif text-3xl font-semibold leading-tight md:text-4xl"
                >
                  One studio.
                  <br />
                  <em className="font-normal">At your desk or by the piano.</em>
                </h2>
                <p className="text-lg leading-relaxed text-mk-ink/75">
                  A clear view of your teaching day, family conversations and studio finances.
                  Designed for every teacher, including those who prefer music to technology.
                </p>
              </div>
              <div className="mt-5 border-y border-mk-gold/50 py-4">
                <p className="text-lg text-mk-ink">
                  <strong className="text-mk-bronze">Tax Lite for EOFY.</strong> Gross tuition,
                  Stripe fees and home-studio hours — ready to review for myTax.
                </p>
                <p className="mt-1 text-base text-mk-ink/70">
                  Planned finance tools. Explore the examples below.
                </p>
              </div>
              <StudioShowcase />
              <p className="mt-5 text-base text-mk-ink/70">
                Example studio only · no messages or invoices are sent.
              </p>
            </div>
          </section>

          <section aria-labelledby="features-title" className="mk-essentials-band">
            <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-20">
              <Eyebrow>The everyday essentials</Eyebrow>
              <h2
                id="features-title"
                className="mt-4 font-mk-serif text-3xl font-semibold md:text-4xl"
              >
                Less admin. More attention to each student.
              </h2>
              <dl className="mt-8 grid gap-5 md:grid-cols-2">
                {[
                  {
                    Icon: LayoutDashboard,
                    title: "Studio Snapshot · planned",
                    body: "Unpaid, unenrolled, not practising — one calm view of the week. Lists for the detail, CSV for your own notes. Studio-wide finances for owners and admins; teachers keep their own caseload.",
                  },
                  {
                    Icon: CalendarDays,
                    title: "A digital day book",
                    body: "Your teaching week in one place, with one-tap attendance and a clear roll. Keep lessons organised at your desk or beside the piano.",
                  },
                  {
                    Icon: MessageCircle,
                    title: "Family chat, together",
                    body: "Conversations stay beside the student, with practice updates and lesson feedback in one place instead of scattered messages.",
                  },
                  {
                    Icon: Receipt,
                    title: "Clear term invoices",
                    body: "See who has paid and who needs a follow-up. Prepare family invoices without piecing together another spreadsheet.",
                  },
                ].map(({ Icon, title, body }) => (
                  <div
                    key={title}
                    className="mk-gloss-card rounded-lg border border-mk-gold/40 bg-mk-paper p-6 md:p-8"
                  >
                    <dt className="flex flex-col items-start gap-5 font-mk-serif text-2xl font-semibold">
                      <span className="flex size-12 items-center justify-center rounded-md border border-mk-gold/40 bg-mk-cream text-mk-bronze">
                        <Icon aria-hidden className="size-6" />
                      </span>
                      {title}
                    </dt>
                    <dd className="mt-3 text-lg leading-relaxed text-mk-ink/75">{body}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section aria-labelledby="tax-title" className="mk-tax-band bg-mk-ink text-mk-paper">
            <div className="mk-deco-divider" aria-hidden>
              <span />
            </div>
            <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-20">
              <p className="flex flex-wrap items-center gap-3 text-base font-medium uppercase text-mk-gold">
                <span className="h-px w-10 bg-mk-gold" aria-hidden />
                Tax Lite{" "}
                <span className="border-l border-mk-gold/50 pl-3 text-mk-paper/75">Planned</span>
              </p>
              <h2
                id="tax-title"
                className="mt-4 max-w-3xl font-mk-serif text-3xl font-semibold leading-tight md:text-4xl"
              >
                EOFY without rebuilding
                <br />
                the year in a spreadsheet.
              </h2>
              <p className="mt-4 max-w-3xl text-lg leading-relaxed text-mk-paper/80">
                Studio-specific numbers before you ever open Xero. For solo teachers preparing
                cash-basis myTax records: gross tuition, merchant fees and home-studio hours,
                together.
              </p>
              <dl className="mt-10 grid gap-x-12 md:grid-cols-2">
                {taxFeatures.map(({ Icon, title, body }) => (
                  <div
                    key={title}
                    className="mk-tax-feature grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 border-t border-mk-gold/40 py-6"
                  >
                    <Icon aria-hidden className="mt-1 size-6 text-mk-gold" />
                    <dt className="font-mk-serif text-2xl font-semibold">{title}</dt>
                    <dd className="col-start-2 mt-2 text-lg leading-relaxed text-mk-paper/80">
                      {body}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-7 max-w-4xl border-t border-mk-gold/40 pt-5 text-base text-mk-paper/70">
                Tax Lite is record preparation, not a general ledger or tax lodgement. Rent,
                utilities and bank feeds stay in Xero when you grow; Keystone doesn’t replace your
                accountant. Keystone is not a registered tax or BAS agent. Figures are estimates
                based on your data. Confirm with a registered tax agent.
              </p>
            </div>
          </section>

          {/* How enrolment works */}
          <section id="enrolment" className="bg-mk-paper">
            <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
              <Eyebrow>How enrolment works</Eyebrow>
              <h2
                className={`${serif} mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl`}
              >
                From invite to first lesson in three steps.
              </h2>
              <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-0">
                {[
                  ["Invite", "Your studio sends a branded invite — no public sign-up wall."],
                  [
                    "Enrol",
                    "A guided form, one question at a time. Terms accepted properly, with a typed name.",
                  ],
                  [
                    "Teach",
                    "The student appears on your roll with chat, practice and invoicing ready.",
                  ],
                ].map(([t, b], i) => (
                  <li
                    key={t}
                    className="relative md:border-l md:border-mk-gold/60 md:px-10 first:md:border-l-0 first:md:pl-0"
                  >
                    <span
                      className="mk-step-icon inline-flex size-16 items-center justify-center rounded-lg border border-mk-gold/60 bg-mk-cream text-mk-bronze"
                      aria-hidden
                    >
                      {i === 0 ? (
                        <MailOpen className="size-8" />
                      ) : i === 1 ? (
                        <FileSignature className="size-8" />
                      ) : (
                        <BookOpen className="size-8" />
                      )}
                    </span>
                    <h3 className={`${serif} mt-4 text-3xl font-semibold`}>{t}</h3>
                    <p className="mt-3 text-lg leading-relaxed text-mk-ink/75">{b}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <Eyebrow>Pro · room to grow</Eyebrow>
                <h2 className="mt-4 font-mk-serif text-3xl font-semibold leading-tight md:text-4xl">
                  Know prepaid fees vs lessons you’ve actually delivered.
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-mk-ink/75">
                  For growing and multi-teacher studios: a planned CFO view of margin after teacher
                  splits, prepaid tuition, churn and make-up radar, Xero queues and contractor
                  payouts.
                </p>
                <p className="mt-4 text-lg text-mk-ink/75">
                  Getting close to $75,000 in GST turnover? You must register for GST within 21
                  days of reaching it, counting the past 12 months or the next 12. Pro adds Xero
                  sync; your registration obligations are separate from your plan.
                </p>
                <Button asChild variant="ghost" className="mt-5 text-mk-bronze hover:bg-mk-paper">
                  <Link to="/pricing">
                    Compare Base and Pro <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
              <figure data-reveal className="overflow-hidden rounded-lg">
                <img
                  src={teachingMoment}
                  alt="A piano teacher and student working through music with a tablet beside the piano"
                  loading="lazy"
                  width={1536}
                  height={1024}
                  className="aspect-[4/3] w-full object-cover"
                />
                <figcaption className="mt-3 text-base text-mk-ink/70">
                  Less time piecing together numbers. More time teaching.
                </figcaption>
              </figure>
            </div>
          </section>
          <section className="border-t border-mk-gold/50 bg-mk-paper">
            <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 md:grid-cols-2 md:px-10">
              <h2 className="font-mk-serif text-3xl font-semibold">
                The music stays at the centre.
              </h2>
              <p className="text-lg leading-relaxed text-mk-ink/75">
                Lessons, practice and chat beside the student. Native invoices and guided enrolment.
                For families: a clear invite, one-question enrolment, agreements they understand and
                a direct connection to their teacher.
              </p>
            </div>
          </section>
          {/* Trust */}
          <section id="trust" className="bg-mk-ink text-mk-paper">
            <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
              <p className="flex items-center gap-3 text-base font-medium uppercase tracking-[0.18em] text-mk-gold">
                <span className="h-px w-10 bg-mk-gold" aria-hidden />
                Trust, quietly built in
              </p>
              <h2
                className={`${serif} mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl`}
              >
                Student records deserve care.
              </h2>
              <div className="mt-14 grid gap-px overflow-hidden rounded-lg bg-mk-gold/30 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [
                    MapPin,
                    "Australian made, hosted in Sydney",
                    "Designed for a Sydney-hosted workspace, with student privacy at its heart.",
                  ],
                  [
                    Lock,
                    "Staff two-step sign-in",
                    "Planned passwordless sign-in with Google, Microsoft or email link, plus staff MFA.",
                  ],
                  [
                    MailOpen,
                    "Invite-only",
                    "Accounts start from a teacher or Keystone — never an open sign-up.",
                  ],
                  [
                    FileSignature,
                    "Agreements on record",
                    "Clear terms, guardian rules for minors and receipts of acceptance.",
                  ],
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
            <h2 className={`${serif} text-4xl font-semibold leading-tight md:text-6xl`}>
              Bring your studio to Keystone.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-xl leading-relaxed text-mk-ink/75">
              Keystone is invite-only. Tell us about your studio and we'll set you up personally.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <PrimaryCta />
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="border border-mk-ink/25 text-mk-ink hover:bg-mk-paper"
              >
                <a href={SIGN_IN}>Sign in</a>
              </Button>
            </div>
          </section>
        </main>
        <MarketingFooter />
      </div>
    </MarketingMotion>
  );
}
