-- Rollback for 0028_tax_lite. Deletes the studios' Tax Lite records and stored Stripe fees.
drop table if exists public.payment_stripe_fee;
drop table if exists public.tax_home_lesson;
drop table if exists public.tax_admin_session;
drop table if exists public.tax_km_entry;
drop table if exists public.tax_expense;
drop function if exists app_private.check_payment_stripe_fee();
drop function if exists app_private.check_tax_expense();
notify pgrst, 'reload schema';
