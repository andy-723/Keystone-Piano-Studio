import { createFileRoute } from "@tanstack/react-router";
import hero from "@/assets/welcome-hero.jpg";
import insideApp from "@/assets/welcome-inside-app.jpg";
import logo from "@/assets/keystone-logo.jpg";
import { ArrowRight, Check, Lock, MapPin, MailOpen, FileSignature } from "lucide-react";

const SIGN_IN = "https://keystonemusichq.com/login";
const ENQUIRE = "mailto:support@keystonemusichq.com?subject=Request%20a%20studio";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Keystone Music HQ — The calm operating system for music studios" },
      { name: "description", content: "Designed for simplicity, built for scalability. Lessons, family chat, studio news, invoices and agreements in one Sydney-hosted workspace for Australian music studios." },
      { property: "og:title", content: "Keystone Music HQ — The calm operating system for music studios" },
      { property: "og:description", content: "Run lessons, enrolments, chat, invoices and agreements in one calm Australian-hosted workspace." },
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
  return (
    <a href={ENQUIRE} className={`group inline-flex min-h-14 items-center gap-2 rounded-full bg-mk-bronze px-7 text-lg font-semibold text-mk-paper transition hover:bg-mk-ink ${className}`}>
      Request a studio <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" aria-hidden />
    </a>
  );
}

const studioPoints = [
  ["A digital day book", "A clean, simple view focused on lessons. See your day book or your week, and mark attendance, add notes to student files, and manage courses, exams and templates with simple clicks."],
  ["Chat, all in one place", "Families and teachers interact through built-in chat — every message on one platform. Upload videos of a student's performance or an area needing help, or send a quick note about upcoming payments."],
  ["News and notices, organised", "Send notices and news feeds to the right groups — school-holiday closures, recitals, away schedules and more. Organise students into the categories that matter, from Grade 1 to Grade 6, and control how important newsletters reach families."],
  ["No student forgotten", "Visibility into every student's performance, with a built-in red flag for students who need assistance — so teachers can follow through."],
  ["No more invoice nightmares", "Prepare invoices for each family, get reminded each term and trigger the next reminder. Better yet, plug in Stripe and Xero for simple payments and bookkeeping."],
  ["Invite-only enrolment", "Send a branded invite; families complete a guided form. No stray sign-ups on your roll."],
  ["Agreements that stick", "Studio agreement and app terms accepted at enrolment with a typed name and guardian rules for minors."],
];

function Welcome() {
  return (
    <div className="min-h-screen bg-mk-cream font-mk-sans text-mk-ink antialiased">
      {/* Hero */}
      <section className="relative isolate flex min-h-[92svh] flex-col overflow-hidden bg-mk-ink text-mk-paper">
        <img src={hero} alt="Grand piano on an Art Deco stage under a gold sunburst" width={1600} height={1008} className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-mk-ink/90 via-mk-ink/60 to-mk-ink/10" aria-hidden />
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 md:px-10">
          <a href="#top" className="rounded-2xl bg-mk-paper px-3 py-1.5"><img src={logo} alt="Keystone Music HQ" className="h-11 w-auto" /></a>
          <nav className="flex items-center gap-2">
            <a href="#enrolment" className="hidden min-h-12 items-center px-4 text-base text-mk-paper/85 hover:text-mk-paper md:inline-flex">How it works</a>
            <a href="#trust" className="hidden min-h-12 items-center px-4 text-base text-mk-paper/85 hover:text-mk-paper md:inline-flex">Trust</a>
            <a href={SIGN_IN} className="inline-flex min-h-12 items-center rounded-full border border-mk-paper/40 px-5 text-base backdrop-blur-md hover:bg-mk-paper/10">Sign in</a>
          </nav>
        </header>
        <div id="top" className="mx-auto flex w-full max-w-7xl flex-1 items-center px-5 pb-20 md:px-10">
          <div className="max-w-2xl">
            <p className="text-base font-medium uppercase tracking-[0.22em] text-mk-gold">Keystone Music HQ</p>
            <h1 className={`${serif} mt-5 text-[clamp(2.75rem,6.5vw,5.5rem)] font-semibold leading-[1.02] tracking-tight`}>
              Your studio, <em className="font-normal italic">in tune.</em>
            </h1>
            <p className="mt-6 max-w-xl text-xl leading-relaxed text-mk-paper/85">
              Designed for simplicity, built for scalability — one studio, 40+ students. Lessons, chat, news, invoices and agreements in one calm, Australian-hosted workspace.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <PrimaryCta className="bg-mk-paper !text-mk-ink hover:!bg-mk-cream" />
              <a href={SIGN_IN} className="inline-flex min-h-14 items-center px-3 text-lg underline decoration-mk-gold underline-offset-8 hover:decoration-2">Sign in</a>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-10">
        <Eyebrow>Who it's for</Eyebrow>
        <h2 className={`${serif} mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl`}>Built for the teacher. Clear for the family.</h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-mk-gold/50 bg-mk-gold/50 md:grid-cols-2">
          {[
            ["Studio owners & teachers", "Run your studio without spreadsheets and scattered message threads. Everything you need before and after a lesson, on any device.", ["Day book and week view", "Student records, courses and red flags", "Term invoices with Stripe and Xero"]],
            ["Families & guardians", "Enrol from a studio invite, one question at a time. Know exactly what you agreed to, and stay connected to your teacher.", ["Guided enrolment form", "Studio news and recital notices", "Chat and video sharing"]],
          ].map(([title, body, items]) => (
            <article key={title as string} className="bg-mk-paper p-8 md:p-12">
              <h3 className={`${serif} text-3xl font-semibold`}>{title as string}</h3>
              <p className="mt-4 text-lg leading-relaxed text-mk-ink/75">{body as string}</p>
              <ul className="mt-6 space-y-3">
                {(items as string[]).map((i) => (
                  <li key={i} className="flex items-center gap-3 text-lg"><Check className="h-5 w-5 shrink-0 text-mk-bronze" aria-hidden />{i}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* How enrolment works */}
      <section id="enrolment" className="bg-mk-paper">
        <div className="mx-auto max-w-7xl px-5 py-24 md:px-10">
          <Eyebrow>How enrolment works</Eyebrow>
          <h2 className={`${serif} mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl`}>From invite to first lesson in three steps.</h2>
          <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-0">
            {[
              ["Invite", "Your studio emails a branded invite to the family — no public sign-up wall."],
              ["Enrol", "A guided form, one question at a time. Terms accepted properly, with a typed name."],
              ["Teach", "The student appears on your roll with chat, practice and invoicing ready."],
            ].map(([t, b], i) => (
              <li key={t} className="relative md:border-l md:border-mk-gold/60 md:px-10 first:md:border-l-0 first:md:pl-0">
                <span className={`${serif} text-7xl font-normal leading-none text-mk-bronze/25`}>0{i + 1}</span>
                <h3 className={`${serif} mt-4 text-3xl font-semibold`}>{t}</h3>
                <p className="mt-3 text-lg leading-relaxed text-mk-ink/75">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* A look inside */}
      <section className="bg-mk-cream">
        <div className="mx-auto max-w-7xl px-5 py-24 md:px-10">
          <Eyebrow>A look inside</Eyebrow>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <h2 className={`${serif} max-w-2xl text-4xl font-semibold leading-tight md:text-5xl`}>See the studio your families will see.</h2>
            <p className="max-w-md text-lg leading-relaxed text-mk-ink/75">The real day book — lessons, attendance, family chat and invoices on one calm screen.</p>
          </div>
          <figure className="mt-12 overflow-hidden rounded-3xl border border-mk-gold/60 bg-mk-paper shadow-[0_30px_80px_-30px_rgba(28,25,23,0.35)]">
            <img src={insideApp} alt="The Keystone Music HQ day book: today's lessons with attendance, a week strip, family chat and a Term 2 invoice" width={1600} height={1000} loading="lazy" className="h-auto w-full" />
          </figure>
          <ul className="mt-8 flex flex-wrap gap-3">
            {["Day book & week view", "One-tap attendance", "Family chat", "Term invoices"].map((label) => (
              <li key={label} className="rounded-full border border-mk-gold/60 bg-mk-paper px-5 py-2.5 text-base font-medium text-mk-ink">{label}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* What studios get */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-10">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.6fr]">
          <div className="lg:sticky lg:top-10 lg:self-start">
            <Eyebrow>What studios get</Eyebrow>
            <h2 className={`${serif} mt-4 text-4xl font-semibold leading-tight md:text-5xl`}>Everything a real teaching week needs.</h2>
            <p className="mt-5 text-lg leading-relaxed text-mk-ink/75">A calm interface for the minutes before and after lessons — and a mobile-friendly studio for teachers on the move.</p>
          </div>
          <dl className="divide-y divide-mk-gold/50 border-y border-mk-gold/50">
            {studioPoints.map(([t, b], i) => (
              <div key={t} className="grid gap-2 py-7 sm:grid-cols-[3rem_1fr_1.4fr] sm:gap-6">
                <span className="text-base font-medium tabular-nums text-mk-bronze">{String(i + 1).padStart(2, "0")}</span>
                <dt className={`${serif} text-2xl font-semibold`}>{t}</dt>
                <dd className="text-lg leading-relaxed text-mk-ink/75">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="bg-mk-ink text-mk-paper">
        <div className="mx-auto max-w-7xl px-5 py-24 md:px-10">
          <p className="flex items-center gap-3 text-base font-medium uppercase tracking-[0.18em] text-mk-gold"><span className="h-px w-10 bg-mk-gold" aria-hidden />Trust, quietly built in</p>
          <h2 className={`${serif} mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl`}>Student records deserve care.</h2>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-mk-gold/30 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [MapPin, "Australian made, hosted in Sydney", "Secure Sydney hosting, compliant with the Australian Privacy Act — cybersecurity by design."],
              [Lock, "Staff two-step sign-in", "An authenticator is required for studio staff."],
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
          <a href={SIGN_IN} className="inline-flex min-h-14 items-center rounded-full border border-mk-ink/25 px-7 text-lg hover:bg-mk-paper">Sign in</a>
        </div>
      </section>

      <footer className="border-t border-mk-gold/50 bg-mk-paper">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-base text-mk-ink/70 md:px-10">
          <p>© 2026 Synoratech Pty Ltd · Keystone Music HQ</p>
          <nav className="flex flex-wrap gap-6">
            <a href="mailto:support@keystonemusichq.com" className="hover:text-mk-ink">Help</a>
            <a href="#trust" className="hover:text-mk-ink">Privacy</a>
            <a href="#trust" className="hover:text-mk-ink">Terms</a>
            <span>Data hosted in Sydney, Australia</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
