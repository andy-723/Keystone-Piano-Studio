# Changelog

Studio-facing notes for each release. Add a line under "Unreleased" in every pull request.
When a batch goes out, move the lines under a new version heading (`vYYYY.MM.N`) and publish a
GitHub Release with the same text. See `docs/release-process.md`.

## Unreleased

- Billing and invite mail no longer fall back to `studio@keystone.example`; they use the studio email or `noreply@keystonemusichq.com`. Pro CFO overdue chat links open the family invoices tab instead of `pay.keystone.example`. Support fallback is `support@keystonemusichq.com`. No migration.
- Guardian-only sign-ins open the family portal (not the teacher screens). Studio members and platform staff still get the studio. No migration.
- Invoice, renewals, Tax Lite, Pro CFO, parent practice and related studio dates now use the real studio day in live studios (demo still uses the fixture date). No migration.
- Today page for real studios now shows the real date and the lessons from your calendar, including cancelled and moved ones, with a link to the calendar for changes. Attendance buttons, lesson notes, make-up credits and practice history are hidden for real studios until they are saved properly (they stay in the demo studio). No migration.
- Students page shows each student's level, readiness, goal term and last sign-off, and can be filtered by benchmark level. Keystone now keeps a weekly record of each student's progress for staff (never shown to families), ready for Pro stagnation alerts. Needs migration 0019.
- Demo studio sign-in: the Clarke Piano Studio demo can be opened at /demo with a demo email and password (link in the sign-in page footer). The demo account belongs only to the demo studio, sees sample data only, and can't change anything on the server. Keystone admin has an "Open demo studio" button. Setup steps in docs/security/demo-account.md.
- Keystone Grade Benchmark. Teachers can start a course from Foundation to Grade 8, with a Recreational, AMEB, ABRSM or Trinity pathway. It sets up four areas weighted 40/20/20/20 (Repertoire, Technical work, Theory and reading, Ear, sight-reading and pedal), each level's scales and skills checklist, and empty piece slots. In lessons, scales are one tap for In progress or Mastered at tempo, and theory and ear items are ticked off. Families now see the goal (level and term), a bar per area with counts such as "12 of 14 done", and what their level usually looks like. Piece stages have clearer names. The benchmark is Keystone's own guide; no exam board lists are included. No migration.
- Studio snapshot page tidied so nothing shows twice. Pro CFO is now Pro only: Base studios see a locked card listing what Pro adds, with an upgrade link. Collected cash, overdue invoices, practice at risk and lessons delivered stay in the Studio Snapshot for every plan, and the "Send reminder in chat" button for overdue invoices is now in the Snapshot's overdue list. Tax Lite (every plan) now sits straight under the Snapshot.
- Slimmer top bar on the public pages: a one-row bar with the smaller logo, and the language switch and Sign in in their own pill at the top right (inside the menu on phones).

- Pricing no longer mentions GST while Keystone is not registered for GST. Base stays A$29 and Pro A$49 a month; the GST toggle stays removed.
- Tax and GST wording fixed after the tax review. Prices now show the total. Tax Lite counts only home hours you confirm plus admin time you log, uses the actual fees Stripe reports, records on-charged costs as income, uses 91c/km up to 5,000 km, and asks you to review figures before exporting an EOFY summary. Pro CFO has a GST threshold monitor with a next-12-months estimate, shows estimated net GST (not BAS), and adds super and card-surcharge notes.
- Email notifications, in the same branded look as the sign-in emails. Families get an email when
  a teacher's chat message has been unread for 15 minutes, straight away for news posts marked
  important, and a 7am daily update for other news and teacher feedback shared with them. Studio
  owners and teachers get an email when a family's message has been unread for 15 minutes. One
  email per chat until it's read, nothing between 9pm and 7am studio time, and emails never
  include the message text or a child's name. Everyone can switch each kind off (Settings for
  studios, Help for families, or the unsubscribe link in every email). Needs migration 0018 and
  the 15-minute schedule in `docs/security/notifications.md`.
- The public website and the family portal can now be read in English, 中文 or Tiếng Việt. Legal documents stay in English.
- The public Terms of use and Privacy pages, and the Keystone terms families accept in the app,
  now show the full drafted version 3 text (Parts A to D, with the supplier list and retention
  sections). Still a draft for solicitor review; bracketed fields are facts still to be filled in.
- The calendar now works on the demo studio (Clarke Piano Studio), including for platform staff:
  it shows the demo timetable, and lessons you add, move or cancel there stay in that browser tab
  and reset on reload. Google Calendar is not offered on the demo. Demo data now shows a
  "Demo studio" label next to the studio name.
- The Keystone logo on public pages (sign-in, help, terms, privacy, disclaimer, contact, welcome,
  pricing) now goes to the welcome page, or to your studio if you're already signed in. It never
  opens the demo app.
- New public Contact us page (`/contact`). "Request a studio" on the welcome and pricing pages now
  opens it with "Set up a new studio" and the plan preselected; messages go through the same
  support request path as the help centre. Keystone's privacy contact is now
  privacy@keystonemusichq.com.
- Welcome and pricing pages share one footer: "© 2026 Keystone Music HQ" with links to Pricing,
  Help, Terms of use, Privacy and a new public Website terms and disclaimer page (`/disclaimer`).
- Visitors who aren't signed in and open keystonemusichq.com now land on the welcome page
  (`/welcome`); signed-in people still go straight to their studio, and other app links still go
  to sign-in first.
- Art Deco admin / studio / family controls now share the same hover and focus styles (`ks-btn`
  classes): admin console (Studios and other tabs), studio pause/pay CTAs, public Sign in, and
  clearer family portal tab hover.
- Public `/welcome` and `/pricing` pages (designed in Lovable, ported onto current main). Base is
  A$29/month for up to 30 students; Pro is A$49/month, unlimited. Base cap lowered from 35 to 30
  in the app, help centre, admin console and database (migration 0017, new students only).
- CI Database checks clear leftover Supabase containers/ports before `supabase start`, so a
  stuck `:54322` bind does not fail the job.
- Clearer button hover and keyboard focus across the app (shared Button tokens, nav, login CTAs,
  Snapshot tiles and Tax Lite / Pro CFO actions) — bronze darkens, paper lightens; touch stays clean.
- Family invoices, payments, credit notes and billing settings are now saved per studio. Invoice
  and credit note numbers come from the database (gapless per studio), real studios use today's
  date, and changing bank details checks a real authenticator code (migration 0016).
- Student courses and the studio's own Library templates are now saved per studio. A real
  student starts on an empty course instead of demo pieces, and target terms are no longer fixed
  to 2027 (migration 0015).
- Studio news and student groups are now saved per studio, and scheduled posts follow the real
  clock for real studios (migration 0014).
- Family chat is now saved per studio: messages, new family chats and read status survive a
  reload, and families only ever see their own chat (migration 0013).
- New: Pro CFO on Snapshot for owners and admins — net cash vs Stripe fees, studio margin /
  solo net, unearned tuition, Xero + GST health, earned vs collected with at-risk and make-up
  liability, Xero queue retry, teacher remittance export, overdue chat chaser, and $75k GST radar
  (mock Xero; not live 2-way sync or BAS lodging).
- New: Tax Lite (Accounting Lite) on Snapshot for owners and admins — billable pass-through
  expenses onto family drafts, Stripe gross vs merchant fees (YTD / AU FY), home-studio hours at
  ATO 70c/hr, optional kilometre log, and EOFY tax pack CSV. Not a second ledger or Xero sync.
- New: Studio snapshot for owners and admins — week/month tiles for revenue collected, overdue,
  active students, incomplete invites, practice at risk and lessons delivered, with list drill-downs
  and CSV export (Australia/Sydney). Teachers keep Today without whole-studio revenue.
- New: Calendar. Give students weekly or one-off lesson times, then move or cancel a single week,
  change the regular time from a given week, or stop lessons. Optional one-way sync to a
  "Keystone lessons" calendar in Google Calendar (migration 0010).
- Studio tour now follows the order an owner sets up: studio details, terms and privacy, payment details, invoices, enrolling, course templates, news and chat. It ends back on studio details and offers a step-by-step setup guide.
- New studios start clean: each real studio now sees only its own students and families, with
  one example student it can delete. Studio details, studio terms, students and families are
  saved per studio and survive a reload (migration 0011). Chat, news, courses and invoices start
  empty for a real studio and are saved in the next releases. The demo studio keeps the demo data.
- Fixed: studios created in the admin console no longer start read-only ("your studio is
  paused"). The console now asks for starting access (complimentary, pilot or none).
- Fixed: studio student/family invites now send through Resend on the server when live keys are present (they previously stayed in the mock outbox); email failures show in the enrol UI.
- Faster: platform admin and support reach `/admin` without waiting on studio/parent mock loaders; sign-in reuse skips a repeat account check after MFA.
- Faster: server code now runs in Sydney next to the database, the first page download is about
  40% smaller, and the admin studio list makes far fewer database round trips.
- Fixed: database access checks for signed-in users failed with "permission denied for schema auth" (migration 0008).
- Fixed: the platform audit log could be edited by server code; it is now append-only (migration 0009).
- Release safety: every pull request is now checked automatically (tests, build, and every
  database change applied to a fresh database) before it can go live.

## v2026.11.0 (10 Nov 2026)

Baseline before the pilot: Art Deco sign-in with MFA, family onboarding, native invoicing,
studio subscription access (0006), onboarding tours.
