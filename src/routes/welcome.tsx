import { createFileRoute, Link } from "@tanstack/react-router";
import hero from "@/assets/welcome-hero.jpg";
import logo from "@/assets/keystone-logo.jpg";
import { CalendarDays, MessageCircle, Receipt, GraduationCap, Languages, ShieldCheck, Megaphone, Upload } from "lucide-react";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Keystone Music HQ — Run your piano studio in one calm place" },
      { name: "description", content: "Timetable, lessons, family chat, GST invoices and student progress for Australian music teachers." },
      { property: "og:title", content: "Keystone Music HQ — Studio OS for music teachers" },
      { property: "og:description", content: "Timetable, lessons, family chat, GST invoices and student progress in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

const usps = [
  { icon: CalendarDays, title: "A day-book, not a spreadsheet", body: "Today's lessons, a week timetable that knows school holidays, and moves that never double-book you." },
  { icon: Receipt, title: "Term invoices in minutes", body: "Quantities worked out from your calendar, GST handled, overdue payments flagged before they slip." },
  { icon: GraduationCap, title: "Progress families can see", body: "Weighted courses, exam readiness stages and weekly practice goals — without exposing private notes." },
  { icon: MessageCircle, title: "Chat that stays in the app", body: "One thread per family, lesson summaries, voice notes and make-up requests. No personal number shared." },
  { icon: Languages, title: "Bilingual family portal", body: "Parents read news, invoices and progress in English or 简体中文." },
  { icon: Megaphone, title: "Studio news with receipts", body: "Targeted posts, photo consent checks and a clear count of who has seen and acknowledged." },
  { icon: Upload, title: "Bring your roster in one go", body: "Paste from a spreadsheet; siblings are grouped and mistakes explained in plain words." },
  { icon: ShieldCheck, title: "Built for Australian studios", body: "en-AU dates, state calendars, make-up credit policies and data hosted in Sydney." },
];

function Welcome() {
  return (
    <div className="welcome min-h-screen bg-deco-ink text-deco-cream">
      <section className="relative isolate overflow-hidden">
        <img src={hero} alt="Grand piano on an art-deco stage under a gold sunburst" width={1600} height={1008} className="absolute inset-0 -z-10 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-deco-ink/40 via-deco-ink/60 to-deco-ink" />
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 p-5">
          <img src={logo} alt="Keystone Music HQ" className="h-14 w-auto rounded-xl bg-deco-cream px-3 py-1" />
          <Link to="/" className="inline-flex min-h-12 items-center rounded-xl border border-deco-gold/60 px-5 text-base hover:bg-deco-gold/15">Sign in</Link>
        </header>
        <div className="mx-auto max-w-6xl px-5 pb-28 pt-16 md:pt-28">
          <p className="text-base uppercase tracking-[0.25em] text-deco-gold">Studio OS for music teachers</p>
          <h1 className="mt-4 max-w-3xl text-5xl leading-tight md:text-7xl">Keep the music going. We'll keep the studio running.</h1>
          <p className="mt-6 max-w-2xl text-xl text-deco-cream/85">Lessons, families, invoices and progress — together in one calm day-book designed for Australian piano studios.</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link to="/" className="inline-flex min-h-14 items-center rounded-xl bg-deco-gold px-7 text-lg font-bold text-deco-ink hover:brightness-110">Set up your studio</Link>
            <a href="#features" className="inline-flex min-h-14 items-center rounded-xl border border-deco-cream/40 px-7 text-lg hover:bg-deco-cream/10">See what's inside</a>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <div className="mb-12 flex items-center gap-4">
          <span className="h-px flex-1 bg-deco-gold/40" />
          <h2 className="text-center text-3xl md:text-4xl">Why teachers choose Keystone</h2>
          <span className="h-px flex-1 bg-deco-gold/40" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {usps.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-2xl border border-deco-gold/25 bg-deco-cream/[0.04] p-6">
              <Icon className="h-9 w-9 text-deco-gold" aria-hidden />
              <h3 className="mt-4 text-xl">{title}</h3>
              <p className="mt-2 text-base text-deco-cream/75">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-deco-cream text-deco-ink">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-3">
          {[["One app", "for teachers, parents and students"], ["0 SMS", "every message stays in-app"], ["Mon–Sat", "timetable aware of terms & holidays"]].map(([big, small]) => (
            <div key={big} className="border-l-4 border-deco-gold pl-5">
              <p className="font-display text-4xl">{big}</p>
              <p className="mt-1 text-lg text-deco-ink/75">{small}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-24 text-center">
        <h2 className="text-4xl md:text-5xl">Ready for Term 2?</h2>
        <p className="mx-auto mt-4 max-w-xl text-xl text-deco-cream/80">Import your roster, send invitations, and teach your first lesson the same afternoon.</p>
        <Link to="/" className="mt-8 inline-flex min-h-14 items-center rounded-xl bg-deco-gold px-8 text-lg font-bold text-deco-ink hover:brightness-110">Get started</Link>
      </section>

      <footer className="border-t border-deco-gold/20 px-5 py-8 text-center text-base text-deco-cream/60">Help · Privacy · Terms · Data hosted in Sydney, Australia</footer>
    </div>
  );
}
