import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Minus, Laptop, Tablet, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PUBLIC_PLANS } from "@/lib/plans";
import logo from "@/assets/keystone-logo.jpg";
import { MarketingMotion } from "@/components/MarketingMotion";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [
    { title: "Base & Pro pricing — Keystone Music HQ" },
    { name: "description", content: "Compare Keystone Music HQ Base at A$29/month plus GST for 30 students and Pro at A$49/month plus GST with unlimited students and Xero. Explore our financial tools roadmap." },
    { property: "og:title", content: "Base & Pro pricing — Keystone Music HQ" },
    { property: "og:description", content: "One calm studio workspace. Base for everyday teaching; Pro for growing studios. Transparent Australian pricing and a clearly marked financial roadmap." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Pricing,
});

const enquire = (plan: string) => `mailto:support@keystonemusichq.com?subject=${encodeURIComponent(`Request a studio — ${plan}`)}`;
const shared = ["Day book, week view & make-ups", "Attendance & student notes", "Courses, exams & template library", "Guided student enrolment", "Weekly assignments & practice logs", "Family chat & targeted studio news", "Parent portal in English & Chinese", "Term invoices & payment reminders", "Stripe: PayTo, direct debit & card"];
const pro = ["Unlimited active students", "Xero invoice & payment sync", "Recordings & async video lessons", "Teacher recording review queue", "Student attention flags & board rules"];
const comparison = [
  { label: "Active students", base: "Up to 30", pro: "Unlimited" },
  { label: "Lessons, courses & family communication", base: "Included", pro: "Included" },
  { label: "Term invoicing & Stripe payments", base: "Included", pro: "Included" },
  { label: "Xero invoice & payment sync", base: "Not included", pro: "Included" },
  { label: "Video lessons, recordings & review queue", base: "Not included", pro: "Included" },
  { label: "Student attention flags & board rules", base: "Not included", pro: "Included" },
];
const financialRoadmap = [
  { title: "Studio Snapshot", base: "A planned week/month pulse: collected revenue, overdue balances, roll, incomplete invites, practice and delivered lessons.", pro: "Owner/admin studio totals with teachers scoped to their caseload; unlimited roll." },
  { title: "Student costs, without the double entry", base: "Billable books and exam fees on family invoices; a lightweight expense log.", pro: "Everything in Base, plus receipt forwarding and billable costs synced to Xero." },
  { title: "Know what you actually collected", base: "Annual gross tuition and Stripe fee summary, with an EOFY export.", pro: "Gross-to-net reconciliation, earned versus collected revenue, prepaid tuition and studio margin." },
  { title: "Home studio and travel", base: "Teaching and admin hours, an illustrative 70¢/hr home-office estimate, optional kilometre log and EOFY CSV.", pro: "Everything in Base, plus GST radar, teacher splits and contractor payout reporting." },
];

function Pricing() {
  return <MarketingMotion><div className="min-h-screen bg-mk-cream font-mk-sans text-mk-ink antialiased">
    <header className="border-b border-mk-gold/50 bg-mk-paper">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 md:px-10">
        <Link to="/welcome" aria-label="Keystone Music HQ home"><img src={logo} alt="Keystone Music HQ" className="h-12 w-auto max-w-[190px]" /></Link>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1">
          <Button asChild variant="ghost" className="text-mk-ink hover:bg-mk-cream"><Link to="/welcome">Overview</Link></Button>
          <Button asChild variant="ghost" className="text-mk-bronze hover:bg-mk-cream"><Link to="/pricing" aria-current="page">Pricing</Link></Button>
          <Button asChild variant="outline" className="border-mk-bronze bg-transparent text-mk-bronze hover:bg-mk-cream hover:text-mk-ink"><a href="https://keystonemusichq.com/login">Sign in</a></Button>
        </nav>
      </div>
    </header>

    <main>
      <section className="mk-pricing-intro relative mx-auto max-w-7xl overflow-hidden px-5 pb-12 pt-14 md:px-10 md:pt-20">
        <p className="text-base font-semibold text-mk-bronze">KEYSTONE MUSIC HQ · PRICING</p>
        <h1 className="mt-5 font-mk-serif text-4xl font-semibold leading-tight md:text-6xl">A simple plan.<br />Room to grow.</h1>
        <p className="mt-6 max-w-2xl text-xl leading-relaxed text-mk-ink/75">The teaching essentials in Base. More students, deeper visibility and Xero automation in Pro. One clear workspace either way.</p>
        <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-3 text-base text-mk-bronze"><span className="flex items-center gap-2"><Laptop aria-hidden className="size-5" />Laptop</span><span className="flex items-center gap-2"><Tablet aria-hidden className="size-5" />iPad & tablet</span><span>Monthly pricing · Australian dollars</span></div>
      </section>

      <section aria-label="Monthly plans" className="mx-auto max-w-7xl px-5 pb-16 md:px-10">
        <div className="grid gap-6 md:grid-cols-2">
          {PUBLIC_PLANS.map(plan => <article key={plan.id} className={`mk-plan flex min-w-0 flex-col rounded-lg border p-6 md:p-9 ${plan.id === "pro" ? "border-mk-bronze bg-mk-ink text-mk-paper" : "border-mk-gold/60 bg-mk-paper"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-mk-serif text-3xl font-semibold">{plan.name}</h2><span className={`text-base ${plan.id === "pro" ? "text-mk-paper/80" : "text-mk-bronze"}`}>{plan.studentLimit ? `Up to ${plan.studentLimit} students` : "Unlimited students"}</span></div>
            <p className={`mt-3 text-lg ${plan.id === "pro" ? "text-mk-paper/75" : "text-mk-ink/75"}`}>{plan.id === "base" ? "For a solo teacher’s everyday teaching week." : "For growing studios that want less admin."}</p>
            <p className="mt-7 flex flex-wrap items-baseline gap-2"><span className="font-mk-serif text-6xl font-semibold">A${plan.monthlyCents / 100}</span><span className="text-lg">/ month + GST</span></p>
            <p className={`mt-2 text-base ${plan.id === "pro" ? "text-mk-paper/75" : "text-mk-ink/70"}`}>A${(plan.gstInclusiveCents / 100).toFixed(2)} including GST</p>
            <Button asChild size="lg" className={`mt-7 w-full shadow-none ${plan.id === "pro" ? "bg-mk-paper text-mk-ink hover:bg-mk-cream" : "bg-mk-bronze text-mk-paper hover:bg-mk-ink"}`}><a href={enquire(plan.name)}>Request a studio <ArrowRight aria-hidden /></a></Button>
            <h3 className="mt-8 text-lg font-semibold">{plan.id === "base" ? "The essentials, together" : "Everything in Base, plus"}</h3>
            <ul className="mt-5 space-y-3">{(plan.id === "base" ? shared : pro).map(feature => <li key={feature} className="flex items-start gap-3 text-lg"><Check aria-hidden className={`mt-1 size-5 shrink-0 ${plan.id === "pro" ? "text-mk-gold" : "text-mk-bronze"}`} /><span>{feature}</span></li>)}</ul>
            {plan.id === "pro" && <p className="mt-8 border-t border-mk-gold/40 pt-5 text-lg text-mk-paper/80">Just A$20 more per month + GST. Keep your teaching workflow; add automation and room for every student.</p>}
          </article>)}
        </div>
        <p className="mt-6 max-w-4xl text-base text-mk-ink/75">Studios are invite-only. Requesting a studio opens an email enquiry, not a subscription checkout. Stripe processing fees and any Xero subscription are separate. The current app is a prototype: payments, plan changes and integrations are simulated.</p>
      </section>

      <section className="bg-mk-paper py-16">
        <div className="mx-auto max-w-7xl px-5 md:px-10">
          <h2 className="font-mk-serif text-3xl font-semibold md:text-4xl">The difference, at a glance.</h2>
          <div className="mt-8" role="table" aria-label="Base and Pro feature comparison">
            <div role="row" className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 border-b border-mk-bronze py-4 text-base font-semibold sm:gap-6"><span role="columnheader">Capability</span><span role="columnheader">Base</span><span role="columnheader">Pro</span></div>
            {comparison.map(row => <div key={row.label} role="row" className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 border-b border-mk-gold/40 py-5 text-base sm:gap-6 sm:text-lg"><span role="cell" className="font-medium">{row.label}</span>{[row.base, row.pro].map((value, i) => <span role="cell" key={i} className="flex min-w-0 flex-wrap items-center gap-2">{value === "Included" ? <Check aria-hidden className="size-5 shrink-0 text-mk-bronze" /> : value === "Not included" ? <Minus aria-hidden className="size-5 shrink-0 text-mk-bronze" /> : null}{value}</span>)}</div>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-10">
        <p className="text-base font-semibold text-mk-bronze">FINANCIAL ROADMAP · PLANNED, NOT AVAILABLE YET</p>
        <h2 className="mt-4 max-w-3xl font-mk-serif text-3xl font-semibold md:text-4xl">Better studio finances.<br />Not another accounting ledger.</h2>
        <p className="mt-5 max-w-3xl text-lg text-mk-ink/75">Snapshot and Tax Lite for solo owners in Base; a deeper CFO view for growing studios in Pro. These are planned additions, not features you can use today. Base remains the plan name — no separate Starter subscription.</p>
        <div className="mt-10 divide-y divide-mk-gold/50 border-y border-mk-gold/50">{financialRoadmap.map(item => <div key={item.title} className="grid gap-5 py-8 md:grid-cols-3 md:gap-8"><h3 className="font-mk-serif text-2xl font-semibold">{item.title}</h3><div><p className="text-base font-semibold text-mk-bronze">Base · planned</p><p className="mt-2 text-lg text-mk-ink/75">{item.base}</p></div><div><p className="text-base font-semibold text-mk-bronze">Pro · planned</p><p className="mt-2 text-lg text-mk-ink/75">{item.pro}</p></div></div>)}</div>
        <p className="mt-6 max-w-3xl text-base text-mk-ink/70">Tax tools will support record-keeping, not lodge returns or replace professional advice. Eligibility, rates and reporting obligations must be checked against current ATO guidance. Your studio’s GST obligations do not depend on which Keystone plan you choose.</p>
      </section>

      <section className="border-t border-mk-gold/50 bg-mk-paper py-16">
        <div className="mx-auto max-w-4xl px-5 md:px-10"><h2 className="font-mk-serif text-3xl font-semibold">A few practical questions.</h2>
          <div className="mt-8 divide-y divide-mk-gold/50">{[
            ["What happens when I reach 30 students?", "Base includes 30 active students. From student 31, the prototype shows an upgrade notice, but does not block enrolment or remove student records. Pro includes unlimited students."],
            ["Do I need Pro if I’m GST registered?", "No. Term invoices with GST are included in both plans. Choose Pro for Xero sync and advanced teaching tools; GST registration is determined by your circumstances, not your plan."],
            ["Can I change plans without losing records?", "Yes. The prototype preserves your records when changing plans. Switching to Base disables Pro tools without deleting their data. Simulated plan changes are available in Settings, under Plan and billing."],
            ["Is this ready for live payments and tax reporting?", "Not yet. The current studio app is mock-only. Stripe and Xero connections do not make real transfers, and the financial roadmap tools have not been built. Request a studio to discuss availability."],
          ].map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">{question}<ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary><p className="mt-4 max-w-3xl text-lg leading-relaxed text-mk-ink/75">{answer}</p></details>)}</div>
          <div className="mt-10 flex flex-wrap gap-3"><Button asChild size="lg" className="bg-mk-bronze text-mk-paper shadow-none hover:bg-mk-ink"><a href={enquire("Base or Pro")}>Request a studio <ArrowRight aria-hidden /></a></Button><Button asChild variant="ghost" size="lg" className="text-mk-bronze hover:bg-mk-cream"><Link to="/welcome">See inside Keystone <ArrowRight aria-hidden /></Link></Button></div>
        </div>
      </section>
    </main>
    <footer className="border-t border-mk-gold/50 px-5 py-8 text-base text-mk-ink/70"><div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 md:px-5"><p>© 2026 Synoratech Pty Ltd · Keystone Music HQ</p><a className="inline-flex min-h-12 items-center text-mk-bronze underline underline-offset-4" href="mailto:support@keystonemusichq.com">Contact Keystone</a></div></footer>
  </div></MarketingMotion>;
}