# Changelog

Studio-facing notes for each release. Add a line under "Unreleased" in every pull request.
When a batch goes out, move the lines under a new version heading (`vYYYY.MM.N`) and publish a
GitHub Release with the same text. See `docs/release-process.md`.

## Unreleased

- Tax and GST wording fixed after the tax review. Prices now show the total (Keystone is not registered for GST, so no GST is charged). Tax Lite counts only home hours you confirm plus admin time you log, uses the actual fees Stripe reports, records on-charged costs as income, uses 91c/km up to 5,000 km, and asks you to review figures before exporting an EOFY summary. Pro CFO has a GST threshold monitor with a next-12-months estimate, shows estimated net GST (not BAS), and adds super and card-surcharge notes.
- The public website and the family portal can now be read in English, 中文 or Tiếng Việt. Legal documents stay in English.
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
