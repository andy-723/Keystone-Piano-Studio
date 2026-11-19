-- 0021 Stripe Connect for family payments (19 Nov 2026).
-- Each studio links its OWN Stripe account to Keystone (Stripe-hosted onboarding, full Stripe
-- Dashboard, direct charges: the studio is the merchant and pays Stripe's fees; Keystone takes no
-- application fee). Families pay an invoice through Stripe Checkout on the studio's account; the
-- Connect webhook records the payment in public.payment.
-- Expand-only. Writes are service-role only (server code after requireStudioRole or a verified
-- Stripe signature). Staff of the studio can read their own row.

create table if not exists public.stripe_connect_account (
  studio_id uuid primary key references public.studio(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  business_name text,
  livemode boolean not null default false,
  created_by uuid,
  disconnected_at timestamptz,
  -- Set when the studio removes Keystone in Stripe: that account can't be used again, so the
  -- next Connect with Stripe creates a fresh one.
  deauthorized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_connect_account enable row level security;
revoke all on table public.stripe_connect_account from anon, public;
revoke insert, update, delete on table public.stripe_connect_account from authenticated;
grant select on table public.stripe_connect_account to authenticated;

drop policy if exists stripe_connect_account_staff_select on public.stripe_connect_account;
create policy stripe_connect_account_staff_select on public.stripe_connect_account
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner', 'admin', 'teacher']));

drop trigger if exists stripe_connect_account_touch on public.stripe_connect_account;
create trigger stripe_connect_account_touch
  before update on public.stripe_connect_account
  for each row execute function app_private.touch_updated_at();

-- One payment row per Stripe PaymentIntent, so a retried webhook never records a payment twice.
create unique index if not exists payment_stripe_payment_intent_once
  on public.payment (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Connect webhook idempotency (separate from Keystone's own billing webhook). Service role only.
create table if not exists public.connect_webhook_event (
  id text primary key,
  type text not null,
  stripe_account_id text,
  studio_id uuid null references public.studio(id) on delete set null,
  received_at timestamptz not null default now()
);
alter table public.connect_webhook_event enable row level security;
revoke all on table public.connect_webhook_event from anon, authenticated, public;

-- BECS direct debits that Stripe accepted but has not settled yet (a few business days). While
-- one is open, Keystone won't start another online payment for that invoice, so a family can't
-- pay twice. Cleared when the debit succeeds or fails. Service role only.
create table if not exists public.connect_pending_payment (
  checkout_session_id text primary key,
  studio_id uuid not null references public.studio(id) on delete cascade,
  invoice_id uuid not null references public.invoice(id) on delete cascade,
  amount_cents int not null,
  created_at timestamptz not null default now()
);
create index if not exists connect_pending_payment_invoice_idx
  on public.connect_pending_payment (invoice_id);
alter table public.connect_pending_payment enable row level security;
revoke all on table public.connect_pending_payment from anon, authenticated, public;

notify pgrst, 'reload schema';
