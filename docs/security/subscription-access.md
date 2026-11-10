# Studio subscription and access (0006)

Keystone Music HQ charges **one flat subscription per studio** (Base A$29 or Pro A$49 a month + GST
while registered; prices not locked). Everyone in the studio (owner, admins, teachers, guardians)
inherits the studio's access. There is no billing token per person: Supabase session JWTs stay as they
are, and access follows `public.studio_subscription.status`.

## Statuses and what people can do

| Status | Set by | Owner | Admin / teacher | Guardian |
| --- | --- | --- | --- | --- |
| `incomplete` (new studio, not paid yet) | default for new studios | read-only, can pay | no access | no access |
| `pilot` (MSA 3.5) | admin console, with Order Form end date | full until end date, then read-only | full until end date | full until end date |
| `comp` (complimentary) | admin console; all studios that existed before 0006 | full (until end date if set) | full | full |
| `trialing`, `active` | Stripe | full | full | full |
| `past_due` (payment failed, MSA 5.3) | Stripe | full | full | full |
| `suspended` (MSA 12.2) | daily job, 14 days after the reminder | read-only + export, can pay | no access | no access |
| `canceled` | Stripe | read-only for 30 days after the end (MSA 12.5), then none | no access | no access |

Base allows 35 students (the 36th insert is refused). Pro has no cap. Downgrading never deletes anyone.

## Where it is enforced

1. **Database (RLS).** `app_private.studio_access_level / studio_can_read / studio_can_write` and
   RESTRICTIVE `access_gate_*` policies on every studio table and the `studio-media`, `studio-docs` and
   `invoices` Storage buckets. Tests: `supabase/tests/subscription.test.sql`.
2. **Service-key server code.** `requireStudioRole` now checks access too (402 `studio_paused`).
   Options: `access: "write"` (default), `"read"` (owner of a paused studio may read), `"skip"` (billing only).
3. **Family invites.** A paused or unpaid studio cannot take on new families.
4. **App.** After sign-in, `decideStudioAccessGate` shows a paused screen or a read-only banner. This is
   for clarity only; the database is the real gate.

Residual windows from `docs/security/revocation.md` still apply: open Realtime channels and issued
signed Storage URLs last until they expire.

## MSA v3.2 rules in code

- **5.3** A failed payment emails the owner once (`invoice.payment_failed`) and access stays on.
- **12.2** `/api/cron/subscription-enforcement` (daily, 21:00 UTC) suspends a `past_due` studio 14 days
  after that reminder and emails the owner how to restore access. Read-only export stays available.
- **5.8** Tick "Dispute hold" in the admin console and the job will not suspend that studio.
- **12.5** After cancellation the owner keeps read-only access for 30 days. Deleting data afterwards is
  still a manual process.
- Keystone never charges interest or late fees on its own fees.

## Stripe setup (Andrew, in the Stripe Dashboard)

This is Keystone's own billing, **separate from Stripe Connect** (teachers' family payments).

1. Products: create "Keystone Music HQ Base" (A$29/month) and "Keystone Music HQ Pro" (A$49/month).
   Copy each recurring price id.
2. Webhooks: add an endpoint for **Your account** (not Connected accounts):
   `https://keystonemusichq.com/api/stripe/billing-webhook`, with these events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`,
   `invoice.paid`, `invoice.payment_failed`. Copy the signing secret.
3. Billing → Subscriptions and emails → Manage failed payments: turn on retries, and set "If all retries
   for a payment fail" to **leave the subscription past-due**. Keystone decides suspension, not Stripe.
4. Billing → Customer portal: turn it on (update card, view invoices, cancel). Choose whether
   cancellation is immediate or at period end to match MSA 5.4 Option A/B.
5. Vercel environment variables: `STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`,
   `STRIPE_PRICE_BASE`, `STRIPE_PRICE_PRO` (plus the existing `CRON_SECRET`).

## Before applying 0006 to production

- Apply it in the Supabase SQL editor (paste the whole file and run it once). It ends with
  `notify pgrst, 'reload schema'` so the API sees the new tables straight away. The app code from
  PR #22 expects these tables, so the admin console's studio list fails until 0006 is applied.
- If 0004 (native invoicing) is not applied yet, 0006 skips the invoice tables and prints a notice.
  After applying 0004 later, re-run section c of 0006 (the `do $$ … $$` block): it is safe to repeat.

- Every existing studio becomes `comp` on Pro. Set the real status in the admin console afterwards
  (Edison's teacher: Pilot, Pro, end date from the Order Form).
- New studios created after 0006 start `incomplete`: give them a pilot or have the owner pay.
- Run `supabase test db` (tenancy + subscription tests).
