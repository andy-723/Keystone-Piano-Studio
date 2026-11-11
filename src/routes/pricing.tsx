import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Minus,
  Laptop,
  Tablet,
  MailOpen,
  CalendarDays,
  MessageCircle,
  Receipt,
  ChartNoAxesCombined,
  BookOpen,
  Wallet,
  ArrowDownToLine,
  Layers,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PUBLIC_PLANS } from "@/lib/plans";
import { MarketingNavbar } from "@/components/MarketingNavbar";
import { MarketingFooter } from "@/components/MarketingFooter";
import { MarketingMotion } from "@/components/MarketingMotion";
import teachingMoment from "@/assets/keystone-teaching-moment.jpg";
import { useState } from "react";
import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Base & Pro pricing — Keystone Music HQ" },
      {
        name: "description",
        content:
          "Keystone Music HQ Base: A$29/month plus GST for 30 students. Pro: A$49/month plus GST for unlimited students, video review and Xero. Compare teaching and studio finance features.",
      },
      { property: "og:title", content: "Base & Pro pricing — Keystone Music HQ" },
      {
        property: "og:description",
        content:
          "Teaching essentials and Tax Lite in Base. Unlimited students, video review and deeper studio finances in Pro. Clear Australian pricing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pricing,
});

const enquire = (plan: string) => `/contact?topic=studio&plan=${encodeURIComponent(plan)}`;
const shared = [
  {
    Icon: CalendarDays,
    title: "Your teaching week",
    detail: "Day book, attendance, make-ups and student notes",
  },
  {
    Icon: BookOpen,
    title: "Progress with purpose",
    detail: "Courses, template library, assignments and practice logs",
  },
  {
    Icon: MessageCircle,
    title: "Families, connected",
    detail: "Guided enrolment, chat, news and bilingual parent portal",
  },
  {
    Icon: Receipt,
    title: "Money, made clearer",
    detail: "Term invoices, Stripe payments, Studio Snapshot and Tax Lite",
  },
];
const pro = [
  {
    Icon: Layers,
    title: "Unlimited active students",
    detail: "Room for every student on your roll",
  },
  {
    Icon: Wallet,
    title: "Xero & deeper studio finances",
    detail: "Invoice and payment sync, reconciliation and teacher splits",
  },
  {
    Icon: Video,
    title: "Recordings & video review",
    detail: "Async video lessons and a teacher review queue",
  },
  {
    Icon: ChartNoAxesCombined,
    title: "More visibility, less guesswork",
    detail: "Student attention flags and board rules",
  },
];
const comparison = [
  {
    title: "Teaching & scheduling",
    Icon: CalendarDays,
    rows: [
      { label: "Active students", base: "Up to 30", pro: "Unlimited" },
      { label: "Day book, attendance & make-ups", base: "Included", pro: "Included" },
      { label: "Courses, assignments & practice", base: "Included", pro: "Included" },
      { label: "Video lessons & recording review", base: "Not included", pro: "Included" },
      { label: "Student attention flags & board rules", base: "Not included", pro: "Included" },
    ],
  },
  {
    title: "Family communication",
    Icon: MessageCircle,
    rows: [
      { label: "Guided enrolment, chat & studio news", base: "Included", pro: "Included" },
      { label: "English & Chinese parent portal", base: "Included", pro: "Included" },
    ],
  },
  {
    title: "Invoicing & payments",
    Icon: Receipt,
    rows: [
      { label: "Term invoices, GST & reminders", base: "Included", pro: "Included" },
      { label: "Stripe: PayTo, BECS direct debit & card", base: "Included", pro: "Included" },
      { label: "Books & exam fee reimbursements", base: "Included", pro: "Included" },
    ],
  },
  {
    title: "Studio finances & Tax Lite",
    Icon: Wallet,
    rows: [
      { label: "Studio Snapshot", base: "Included", pro: "Included" },
      { label: "Tax Lite records & EOFY CSV", base: "Included", pro: "Included" },
      { label: "Xero invoice & payment sync", base: "Not included", pro: "Included" },
      { label: "CFO reconciliation & teacher splits", base: "Not included", pro: "Included" },
    ],
  },
];
const financials = [
  {
    Icon: ChartNoAxesCombined,
    title: "Studio Snapshot",
    tag: "Base & Pro",
    body: "Collected revenue, overdue balances, attendance and practice. A clear pulse on the teaching week.",
    extra: "Pro adds deeper studio-wide financial visibility.",
  },
  {
    Icon: Receipt,
    title: "Student expenses",
    tag: "Base & Pro",
    body: "Books and exam fees recorded once, then passed to family invoices as reimbursements — not tuition profit.",
    extra: "Pro adds receipt forwarding and Xero cost sync.",
  },
  {
    Icon: ArrowDownToLine,
    title: "Tax Lite & EOFY",
    tag: "Base & Pro",
    body: "Gross tuition, Stripe fees, home-studio hours and optional travel records, together in an accountant-ready CSV.",
    extra: "Simple record preparation for Australian studio owners.",
  },
  {
    Icon: Layers,
    title: "Xero & the bigger picture",
    tag: "Pro",
    body: "Invoice and payment sync, gross-to-net reconciliation, prepaid tuition and contractor teacher splits.",
    extra: "Know what you collected, earned and paid out.",
  },
];
const faqs = [
  [
    "What happens when I reach 30 students?",
    "Base includes up to 30 students. To add a 31st, move to Pro, which has no student limit. Nothing is removed or hidden, and you can switch plans at any time.",
  ],
  [
    "Do I need Pro if I’m GST registered?",
    "No. Term invoices with GST are included in both plans. Choose Pro for Xero sync, deeper financial visibility and advanced teaching tools. GST registration depends on your circumstances, not your Keystone plan.",
  ],
  [
    "Can I change plans without losing records?",
    "Yes. Your records are preserved when you change plans. Moving to Base turns off Pro-only tools without deleting their data. Manage your plan in Settings, under Plan and billing.",
  ],
  [
    "What’s included in Tax Lite?",
    "Tax Lite brings together gross tuition, merchant fees, student expenses and home-studio hours, with optional travel records and an EOFY CSV. It prepares records for review; it is not a general ledger, BAS lodgement service or a replacement for your accountant. Check eligibility and rates against current ATO guidance.",
  ],
  [
    "How do Stripe and Xero fit into the plans?",
    "Stripe payment options — PayTo, BECS direct debit and card — are part of both plans. Xero invoice and payment sync is a Pro feature. Stripe processing fees and any Xero subscription are separate from Keystone pricing. Discuss connection availability and setup when requesting your studio.",
  ],
  [
    "How do I get started?",
    "Keystone studios are invite-only. Choose Request a studio to email our team about your teaching setup and preferred plan. We’ll discuss availability and help you take the next step.",
  ],
];

function Pricing() {
  const [includeGst, setIncludeGst] = useState(false);
  const reduceMotion = useReducedMotion();
  return (
    <MarketingMotion>
      <div className="min-h-screen bg-mk-cream font-mk-sans text-mk-ink antialiased">
        <MarketingNavbar />
        <main>
          <section className="mk-pricing-hero relative isolate overflow-hidden bg-mk-ink text-mk-paper">
            <img
              src={teachingMoment}
              alt="A teacher and student at the piano with their studio tablet"
              className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-mk-ink/95 via-mk-ink/90 to-mk-ink/40" />
            <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
              <p className="flex items-center gap-3 text-base font-medium text-mk-gold">
                <span className="h-px w-8 bg-mk-gold" aria-hidden />
                KEYSTONE MUSIC HQ · PRICING
              </p>
              <h1 className="mt-5 font-mk-serif text-4xl font-semibold leading-tight md:text-6xl">
                Keystone plans.
                <br />
                <em className="font-normal">Room to grow.</em>
              </h1>
              <p className="mt-5 max-w-2xl text-xl leading-relaxed text-mk-paper/85">
                One workspace for your teaching week and studio finances. Choose the essentials, or
                give your growing studio more room.
              </p>
              <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-base text-mk-paper/85">
                <span className="flex items-center gap-2">
                  <MailOpen aria-hidden className="size-5 text-mk-gold" />
                  Invite-only studios
                </span>
                <span className="flex items-center gap-2">
                  <Receipt aria-hidden className="size-5 text-mk-gold" />
                  Australian dollars · monthly
                </span>
                <span className="flex items-center gap-2">
                  <Laptop aria-hidden className="size-5 text-mk-gold" />
                  <Tablet aria-hidden className="size-5 text-mk-gold" />
                  Desk or piano-side
                </span>
              </div>
            </div>
          </section>

          <section
            aria-label="Monthly plans"
            className="mk-essentials-band px-5 py-12 md:px-10 md:py-16"
          >
            <div className="mx-auto max-w-7xl">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-5">
                <p className="text-lg font-medium text-mk-bronze">Two plans. Billed monthly.</p>
                <div className="flex flex-wrap items-center gap-3 text-base">
                  <span className={includeGst ? "text-mk-ink/65" : "font-semibold text-mk-bronze"}>
                    Excluding GST
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    role="switch"
                    aria-checked={includeGst}
                    aria-label="Show prices including GST"
                    onClick={() => setIncludeGst((value) => !value)}
                    className="relative w-16 shrink-0 rounded-full border border-mk-gold/60 bg-mk-paper shadow-none hover:bg-mk-paper"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-x-1.5 h-7 rounded-full bg-mk-bronze"
                    />
                    <motion.span
                      aria-hidden
                      initial={false}
                      animate={{ x: includeGst ? 25 : 0 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 450, damping: 30 }
                      }
                      className="absolute left-2 size-5 rounded-full bg-mk-paper"
                    />
                  </Button>
                  <span className={includeGst ? "font-semibold text-mk-bronze" : "text-mk-ink/65"}>
                    Including GST
                  </span>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {PUBLIC_PLANS.map((plan) => (
                  <article
                    key={plan.id}
                    className={`mk-plan relative flex min-w-0 flex-col overflow-hidden rounded-lg border p-6 md:p-8 ${plan.id === "pro" ? "mk-pricing-pro border-mk-gold bg-mk-ink text-mk-paper" : "border-mk-gold/50 bg-mk-paper"}`}
                  >
                    <p
                      className={`flex items-center gap-2 text-base font-medium ${plan.id === "pro" ? "text-mk-gold" : "text-mk-bronze"}`}
                    >
                      <span className="h-px w-6 bg-mk-gold" aria-hidden />
                      {plan.id === "base" ? "THE SOLO STUDIO" : "THE GROWING STUDIO"}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      <h2 className="font-mk-serif text-4xl font-semibold">{plan.name}</h2>
                      <span
                        className={`border-b pb-1 text-base ${plan.id === "pro" ? "border-mk-gold/50 text-mk-paper/85" : "border-mk-gold/50 text-mk-bronze"}`}
                      >
                        {plan.studentLimit
                          ? `Up to ${plan.studentLimit} students`
                          : "Unlimited students"}
                      </span>
                    </div>
                    <p
                      className={`mt-3 text-lg ${plan.id === "pro" ? "text-mk-paper/75" : "text-mk-ink/75"}`}
                    >
                      {plan.id === "base"
                        ? "Everything for a well-run teaching week."
                        : "Everything in Base. More space, more insight."}
                    </p>
                    <div className="mt-6 min-h-28">
                      <p
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                        aria-label={`A$${((includeGst ? plan.gstInclusiveCents : plan.monthlyCents) / 100).toFixed(includeGst ? 2 : 0)} per month ${includeGst ? "including GST" : "plus GST"}`}
                      >
                        <NumberFlow
                          aria-hidden
                          animated={!reduceMotion}
                          value={(includeGst ? plan.gstInclusiveCents : plan.monthlyCents) / 100}
                          locales="en-AU"
                          prefix="A$"
                          format={{
                            minimumFractionDigits: includeGst ? 2 : 0,
                            maximumFractionDigits: 2,
                          }}
                          transformTiming={{
                            duration: 550,
                            easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
                          }}
                          className="font-mk-serif text-4xl font-semibold tabular-nums sm:text-6xl"
                        />
                        <span aria-hidden className="text-lg">
                          / month
                        </span>
                      </p>
                      <p
                        className={`mt-2 text-base ${plan.id === "pro" ? "text-mk-paper/75" : "text-mk-ink/70"}`}
                      >
                        {includeGst
                          ? `A$${plan.monthlyCents / 100} excluding GST`
                          : `A$${(plan.gstInclusiveCents / 100).toFixed(2)} including GST`}
                      </p>
                    </div>
                    <Button
                      asChild
                      size="lg"
                      className={`mt-6 min-h-12 w-full shadow-none ${plan.id === "pro" ? "bg-mk-paper text-mk-ink hover:bg-mk-cream" : "bg-mk-bronze text-mk-paper hover:bg-mk-ink"}`}
                    >
                      <a href={enquire(plan.name)}>
                        Request a studio <ArrowRight aria-hidden />
                      </a>
                    </Button>
                    <div
                      className={`relative mt-3 h-7 overflow-hidden text-center text-base ${plan.id === "pro" ? "text-mk-paper/75" : "text-mk-ink/70"}`}
                    >
                      <AnimatePresence initial={false} mode="wait">
                        <motion.p
                          key={String(includeGst)}
                          initial={{ y: reduceMotion ? 0 : 20, opacity: reduceMotion ? 1 : 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: reduceMotion ? 0 : -20, opacity: reduceMotion ? 1 : 0 }}
                          transition={{ duration: reduceMotion ? 0 : 0.18 }}
                        >
                          {includeGst
                            ? "Billed monthly · GST included"
                            : "Billed monthly · plus GST"}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    <h3 className="mt-7 text-lg font-semibold">
                      {plan.id === "base" ? "The essentials, together" : "Your Pro additions"}
                    </h3>
                    <ul className="mt-4 space-y-5">
                      {(plan.id === "base" ? shared : pro).map(({ Icon, title, detail }) => (
                        <li key={title} className="flex items-start gap-3">
                          <Icon
                            aria-hidden
                            className={`mt-1 size-6 shrink-0 ${plan.id === "pro" ? "text-mk-gold" : "text-mk-bronze"}`}
                          />
                          <div>
                            <p className="text-lg font-semibold">{title}</p>
                            <p
                              className={`mt-1 text-base leading-relaxed ${plan.id === "pro" ? "text-mk-paper/75" : "text-mk-ink/75"}`}
                            >
                              {detail}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p
                      className={`mt-7 border-t pt-5 text-base ${plan.id === "pro" ? "border-mk-gold/40 text-mk-paper/80" : "border-mk-gold/40 text-mk-ink/75"}`}
                    >
                      {plan.id === "pro"
                        ? "A$20 more per month + GST — keep the workflow you know, with room for every student."
                        : "Studio Snapshot and Tax Lite included. No separate finance add-on."}
                    </p>
                  </article>
                ))}
              </div>
              <p className="mt-6 max-w-4xl text-base leading-relaxed text-mk-ink/75">
                Personal studio onboarding, by invitation. Stripe processing fees and any Xero
                subscription are separate. Request a studio to discuss your setup and connection
                availability.
              </p>
            </div>
          </section>

          <section
            className="bg-mk-ink py-12 text-mk-paper md:py-16"
            aria-labelledby="financials-title"
          >
            <div className="mx-auto max-w-7xl px-5 md:px-10">
              <p className="text-base font-medium text-mk-gold">BUILT-IN STUDIO FINANCIALS</p>
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <h2
                  id="financials-title"
                  className="font-mk-serif text-3xl font-semibold leading-tight md:text-4xl"
                >
                  Your numbers.
                  <br />
                  <em className="font-normal">Part of the plan.</em>
                </h2>
                <p className="max-w-xl text-lg leading-relaxed text-mk-paper/80">
                  Snapshot for the teaching week. Tax Lite for EOFY. Base brings your solo studio
                  records together; Pro adds the bigger financial picture and Xero sync.
                </p>
              </div>
              <div className="mt-9 grid gap-5 md:grid-cols-2">
                {financials.map(({ Icon, title, tag, body, extra }) => (
                  <article
                    key={title}
                    className="mk-gloss-card rounded-lg border border-mk-gold/40 bg-mk-paper p-6 text-mk-ink md:p-7"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <Icon aria-hidden className="size-7 text-mk-bronze" />
                      <span className="text-base font-semibold text-mk-bronze">{tag}</span>
                    </div>
                    <h3 className="mt-5 font-mk-serif text-2xl font-semibold">{title}</h3>
                    <p className="mt-3 text-lg leading-relaxed text-mk-ink/80">{body}</p>
                    <p className="mt-5 border-t border-mk-gold/40 pt-4 text-base text-mk-bronze">
                      {extra}
                    </p>
                  </article>
                ))}
              </div>
              <p className="mt-7 max-w-4xl text-base leading-relaxed text-mk-paper/75">
                Tax Lite prepares records; it does not lodge returns, prepare BAS or replace
                professional advice. Estimates depend on current ATO rates and eligibility. Your GST
                obligations are independent of your Keystone plan.
              </p>
            </div>
          </section>

          <section className="bg-mk-paper py-12 md:py-16" aria-labelledby="comparison-title">
            <div className="mx-auto max-w-7xl px-5 md:px-10">
              <p className="text-base font-medium text-mk-bronze">BASE OR PRO?</p>
              <h2
                id="comparison-title"
                className="mt-4 font-mk-serif text-3xl font-semibold md:text-4xl"
              >
                The difference, at a glance.
              </h2>
              <div className="mt-8" role="table" aria-label="Base and Pro feature comparison">
                <div
                  role="row"
                  className="mk-compare-row border-b border-mk-bronze py-4 text-base font-semibold"
                >
                  <span role="columnheader">Capability</span>
                  <span role="columnheader" className="text-center">
                    Base
                  </span>
                  <span role="columnheader" className="text-center text-mk-bronze">
                    Pro
                  </span>
                </div>
                {comparison.map(({ title, Icon, rows }) => (
                  <div role="rowgroup" key={title}>
                    <div role="row" className="border-b border-mk-gold/40 bg-mk-cream/60 px-3 py-4">
                      <span
                        role="cell"
                        className="flex items-center gap-3 text-lg font-semibold text-mk-bronze"
                      >
                        <Icon aria-hidden className="size-5 shrink-0" />
                        {title}
                      </span>
                    </div>
                    {rows.map((row) => (
                      <div
                        key={row.label}
                        role="row"
                        className="mk-compare-row border-b border-mk-gold/30 py-4 text-base md:text-lg"
                      >
                        <span role="cell">{row.label}</span>
                        {[row.base, row.pro].map((value, i) => (
                          <span
                            role="cell"
                            key={i}
                            className="flex min-w-0 items-center justify-center text-center"
                          >
                            {value === "Included" ? (
                              <>
                                <Check aria-hidden className="size-6 text-mk-bronze" />
                                <span className="sr-only">Included</span>
                              </>
                            ) : value === "Not included" ? (
                              <>
                                <Minus aria-hidden className="size-5 text-mk-ink/45" />
                                <span className="sr-only">Not included</span>
                              </>
                            ) : (
                              value
                            )}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mk-essentials-band border-t border-mk-gold/40 py-12 md:py-16">
            <div className="mx-auto max-w-4xl px-5 md:px-10">
              <p className="text-base font-medium text-mk-bronze">THE PRACTICAL DETAILS</p>
              <h2 className="mt-4 font-mk-serif text-3xl font-semibold md:text-4xl">
                A few good questions.
              </h2>
              <Accordion type="single" collapsible className="mt-8 space-y-3">
                {faqs.map(([question, answer], i) => (
                  <AccordionItem
                    key={question}
                    value={`faq-${i}`}
                    className="rounded-lg border border-mk-gold/40 bg-mk-paper px-5 md:px-6"
                  >
                    <AccordionTrigger className="min-h-16 gap-5 py-5 text-lg font-semibold text-mk-ink hover:no-underline [&>svg]:size-5 [&>svg]:text-mk-bronze">
                      {question}
                    </AccordionTrigger>
                    <AccordionContent className="pb-6 text-lg leading-relaxed text-mk-ink/75">
                      {answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <div className="mt-12 border-t border-mk-gold/50 pt-8">
                <h3 className="font-mk-serif text-2xl font-semibold">
                  A calmer studio starts here.
                </h3>
                <p className="mt-3 text-lg text-mk-ink/75">
                  Tell us about your studio. We’ll help you find the right fit.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    asChild
                    size="lg"
                    className="bg-mk-bronze text-mk-paper shadow-none hover:bg-mk-ink"
                  >
                    <a href={enquire("Base or Pro")}>
                      Request a studio <ArrowRight aria-hidden />
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    size="lg"
                    className="text-mk-bronze hover:bg-mk-paper"
                  >
                    <Link to="/welcome">
                      See inside Keystone <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>
        <MarketingFooter />
      </div>
    </MarketingMotion>
  );
}
