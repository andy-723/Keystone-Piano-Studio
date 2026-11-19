-- Rollback 0021 Stripe Connect. Payments already recorded from Stripe stay in public.payment
-- (they are real money); only the link table, the webhook log and the unique index go.
-- Transaction; staging first.
drop index if exists public.payment_stripe_payment_intent_once;
drop table if exists public.connect_webhook_event;
drop table if exists public.stripe_connect_account;
notify pgrst, 'reload schema';
