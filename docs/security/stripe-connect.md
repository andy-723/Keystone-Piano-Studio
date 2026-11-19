# Stripe Connect: families pay studios online (0021)

Studios link their **own** Stripe account to Keystone. Families pay an invoice with Stripe
Checkout as a **direct charge** on the studio's account, so:

- the studio is the merchant: the money lands in the studio's Stripe balance and pays out to
  the studio's bank account;
- Stripe bills the studio its standard fees (in Australia, 1.65% + A$0.30 for domestic cards and
  1% + A$0.30 capped at A$3.50 for BECS direct debit, per stripe.com/au/pricing on 19 Nov 2026);
- Keystone takes **no application fee**, never holds the money and pays **no Connect fees** for
  these accounts ("Stripe handles pricing for your users", stripe.com/au/connect/pricing);
- studios never surcharge (NO_SURCHARGE_NOTE).

This is separate from Keystone's own subscription billing (`docs/security/subscription-access.md`,
`/api/stripe/billing-webhook`).

## How it works

| Step | Code |
| --- | --- |
| Owner presses **Connect with Stripe** (Settings → Integrations) | `startStripeOnboardingFn` in `src/server/stripe-connect.ts`: owner + MFA. Creates the studio's account once (`POST /v1/accounts`, country AU, `controller[stripe_dashboard][type]=full`, `controller[fees][payer]=account`, `controller[losses][payments]=stripe`, `controller[requirement_collection]=stripe`, `metadata[studio_id]`), saves the link in `stripe_connect_account`, then returns an **Account Link** (`type=account_onboarding`). No OAuth `ca_` client id is needed. |
| Owner finishes on Stripe and comes back to `/settings?stripe=return` | `getStripeConnectStatusFn` asks Stripe for the account while it is not yet `charges_enabled`, so the card updates without waiting for the webhook. `refresh_url` (`?stripe=refresh`) lets them press the button again for a fresh link. |
| Family presses **Pay now** on an invoice | `createInvoiceCheckoutFn`: the signed-in parent must be a guardian of that invoice's family; the invoice must be sent or part paid; the amount is what is still owing, worked out on the server. Checkout runs on the studio's account (`Stripe-Account` header). Payment methods follow the studio's own Stripe Dashboard settings. |
| Stripe tells Keystone the payment went through | `/api/stripe/connect-webhook` (signature checked with `STRIPE_CONNECT_WEBHOOK_SECRET`) → `handleConnectEvent`: inserts one `payment` row (method `stripe_card` or `stripe_becs`, unique per PaymentIntent), sets the invoice to paid or partially paid and adds a `payment_recorded` invoice event. The studio id in the session metadata must match the account the event came from. |
| Owner presses **Disconnect Stripe** | Sets `disconnected_at`. Families see bank details again. The studio's Stripe account and money stay theirs; Keystone cannot close it. |

Events handled: `account.updated`, `account.application.deauthorized`,
`checkout.session.completed` (card, paid straight away), `checkout.session.async_payment_succeeded`
(BECS direct debit, a few days later). Each event id is handled once (`connect_webhook_event`); if
handling fails the id is forgotten so Stripe's retry is processed.

Security: writes to `stripe_connect_account`, `connect_webhook_event` and Stripe payments are
service-role only, after `requireStudioRole` (staff, MFA) or a guardian check or a verified Stripe
signature. Staff can read their own studio's link row through RLS. No card data touches Keystone.

## Setup steps (Andrew)

### 1. Stripe Dashboard (test mode first, then the same in live mode)

1. Go to **Connect** in the left menu. If Stripe asks, finish the platform questions you started
   on 9 Nov (direct charges, business management software, Stripe-hosted onboarding, full Stripe
   Dashboard for your users, Stripe handles pricing for your users).
2. **Connect → Settings → Branding**: add the Keystone Music HQ name, icon and brand colour. Studios
   see this on the Stripe onboarding page.
3. **Connect → Settings → Onboarding options**: leave Australia as a country you onboard.
4. **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://www.keystonemusichq.com/api/stripe/connect-webhook` (the same host the
     notification cron uses, so Stripe is not sent through a redirect).
   - **Listen to: Events on Connected accounts** (not "Your account").
   - Events: `account.updated`, `account.application.deauthorized`,
     `checkout.session.completed`, `checkout.session.async_payment_succeeded`.
   - Save, then **Reveal** the signing secret (starts `whsec_`). This is a different secret from the
     billing webhook.

### 2. Vercel

1. Project → **Settings → Environment Variables**.
2. Add `STRIPE_CONNECT_WEBHOOK_SECRET` = the `whsec_` value from step 1.4 (Production).
3. Check `STRIPE_SECRET_KEY` is already there (the same key Keystone's subscription billing uses;
   Keystone's Stripe account is the Connect platform). Use the `sk_test_` key while testing.
4. Check `APP_URL` is `https://www.keystonemusichq.com` (Stripe sends people back there).
5. **Deployments → Redeploy** the latest production deployment.

### 3. Supabase

1. **SQL editor** → paste the whole of `supabase/migrations/0021_stripe_connect.sql` → **Run**,
   before merging the pull request.

### 4. Test it (test mode)

1. Sign in as a studio owner → Settings → Integrations → **Connect with Stripe**. Use Stripe's test
   values (phone `000 000 0000`, SMS code `000000`, BSB `110000`, account `000123456`).
2. Back in Keystone the card should say **Connected**.
3. Send a test invoice to a test family, sign in as that parent, open the invoice, **Pay now** →
   card `4242 4242 4242 4242`, any future date, any CVC.
4. Within a few seconds the invoice shows as paid for the parent and the teacher, with a
   "Stripe card" payment.
5. When happy, repeat steps 1.4 and 2 with the live-mode webhook and the `sk_live_` key.

Without `STRIPE_CONNECT_WEBHOOK_SECRET` the Stripe card says online payments are being switched on
and families keep seeing bank details, so nothing breaks before setup.
