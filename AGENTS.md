<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Marketing motion is scoped and optional to preserve readability.
- Profiles and targeted news use scoped mock services; news validates consent/audiences and returns family-safe fields plus receipts. Due schedules release on reads using a separate fixture clock, never background jobs.
- Plans use a scope-keyed mock subscription service with legacy normalisation; Pro capabilities are checked without deleting data, and Opus subscription invoices stay separate from family invoices.
- The teacher enrolment details form is a presentational question flow over the existing onboarding service; later intake, welcome and activation stages retain their service-owned validation.
- Onboarding and libraries are scope-keyed session services; activation deep-copies template sections, items and milestones, while parent intake always derives family ownership and omits teacher diagnostics.
- Assignment services enforce plan, family consent and guardian review approval; async delivery is occurrence-keyed separately from attendance, and policy credits are idempotent ledger entries rather than cancellations.
- Shared controls wrap on phones and dialogs stay within the dynamic viewport; the weekly timetable stacks days on phones and uses columns on larger screens to avoid page-wide horizontal scrolling.
- Screens read/write only through async functions in src/services/ (one file per area) over fixtures in src/mocks/ — so the mock layer can be swapped for a REST API later.
- App shell (nav rail / bottom tabs, role switcher, larger-text toggle) lives in src/routes/__root.tsx via AppShell; role switch swaps teacher app for parent portal there.
- New-teacher mode is a separate root role gate over setup-only session fixtures and namespaced queries; it never mounts demo teacher screens or mutates demo collections. Setup selects a state calendar and saves partial progress; imports use a separate new-studio roster and chat store, never demo collections.
- Student import uses Papa Parse and pure row validation; the async import service revalidates on commit, groups by normalised guardian email, stores batch IDs for idempotency and sends only in-app chat invitations. Demo imports populate roster and weekly slots; new-studio imports remain separately scoped.
- Demo scheduling resolves effective-dated weekly rules and stable-ID one-off exceptions before availability checks; credits use an append-only occurrence-keyed ledger, and booking atomically reserves a slot and debits the balance before chat notification. Existing isolated new-studio setup remains separate from demo scheduling.
- Route loaders prime TanStack Query through mock services; attendance optimistically updates the date-keyed cache with rollback so marking is immediate without bypassing the service layer.
- Live lessons are keyed by occurrence ID; the lessons service composes curriculum and chat services, retains notes in mock session state and sends an idempotent family summary. Readiness uses weighted section-average course stages; practice uses the lesson's Monday–Sunday week and separates student and teacher logs.
- Chat uses a shared list/detail layout and service-backed query caches; attachments use session object URLs and voice playback is simulated, keeping the prototype mock-only. Summary metadata identifies lesson cards without parsing message copy. New message timestamps follow the future-dated fixtures so newest-first ordering remains reliable. Teacher translations read mock English mappings through the chat service and never replace original messages.
- Billing derives Term 2 quantities from timetable weekdays and the shared calendar, stages one session draft per family, and sends idempotently into mock invoices. Only drafts apply current studio tax registration; all issue paths freeze registration, title and reconciled line/total taxes, and issued reads preserve those stored values; the GST setting invalidates invoice caches for both prototype views.
- Parent mode mounts a separate family portal inside the root role gate, keeping teacher routes unmounted and preserving the teacher location on return. Parent services resolve the mock guardian, scope every read/write to that family and return no risk fields; bilingual UI uses src/i18n JSON and reuses chat media/composer with guardian authorship.
- Teacher Students uses roster/profile services to compose schedule, curriculum and family invoices; attendance covers term-to-date with session overrides, while practice charts use four complete seven-day periods ending yesterday. Check-in navigation passes a student ID, validates family ownership in the service and prefills only the teacher composer without sending.
- Client notes have a dedicated mock collection and async service; teacher lesson sheets share the same student/family note context. Parent services explicitly select shared notes for their own family and strip guardian contact numbers from every response.
- Payment records are the source of truth for amount paid and invoice balances; both teacher and parent mock payment actions settle only the remaining balance and retain method/date records.
- Renewals keep independent Term 2–4 session campaigns with own-family parent responses and idempotent invitations plus manual/simulated reminders in family chat; no background job runs. Billing remains Term 2 only and gates on its campaign confirmations, never another term’s responses.

- Integrations use scope-keyed session mock states and async services only; billing stores Xero sync timestamps on issued invoices and new payment records, while parent online payments enforce Stripe status in the service as well as the UI. New-studio integration queries and state remain isolated from demo billing.
- Curriculum services own course edits and append-only checkpoint feedback over mock course fixtures; pure helpers calculate stage readiness and attended-occurrence reminders, and parent responses explicitly select course fields and shared comments to prevent private feedback leakage. Legacy requirement APIs remain for fixture compatibility, not displayed readiness.
