# Keystone Music HQ

Studio operations prototype for teachers and families.

## Development

Requires [Bun](https://bun.sh).

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
bun run dev
```

Other scripts:

```sh
bun run test
bun run build
bun run lint
```

Copy `.env.example` for local overrides. `ONBOARDING_BACKEND` defaults to `mock`, so previews and tests work without Supabase or Resend keys.

## Family onboarding (first live backend slice)

When you switch `ONBOARDING_BACKEND=supabase`, set the variables in `.env.example` (never put `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, or `TURNSTILE_SECRET_KEY` in `VITE_*`).

### Supabase Auth email via Resend (manual dashboard steps)

Do **not** automate this — configure in the Supabase dashboard:

1. **Authentication → SMTP**: host `smtp.resend.com`, port `465`, user `resend`, password = your `RESEND_API_KEY`, sender = `EMAIL_FROM`.
2. Magic-link email templates in English and Chinese.
3. **Site URL** = `APP_URL`, redirect URL = `APP_URL/auth/callback`.
4. Enable Supabase Auth captcha protection with the same Cloudflare Turnstile secret used by the app (`TURNSTILE_SECRET_KEY` / `VITE_TURNSTILE_SITE_KEY`).

Project region: Sydney (`ap-southeast-2`). Apply `supabase/migrations/0001_family_onboarding.sql` then `supabase/seed.sql`.

### Before applying 0003

Do **not** apply `supabase/migrations/0003_tenant_hardening.sql` to the production Supabase project until Andrew reviews. First run the read-only inventory in `scripts/inventory-real-data.sql` in the live SQL editor (row counts only — no names or content). Record results in the incident log; do not paste them anywhere public.

`0003_tenant_hardening.rollback.sql` restores 0001 RLS behaviour for **local rehearsal** only (`supabase start`).

Native family invoicing lives in `supabase/migrations/0004_native_invoicing.sql` (named 0004 because 0003 already shipped; the ADR prompt originally called this 0002). It is not wired in mock mode.

Invite reminders run daily via Vercel Cron (`vercel.json`) at 09:00 Sydney against `/api/cron/invite-reminders` with `Authorization: Bearer CRON_SECRET`.


## Live sign-in setup

See [`docs/security/auth.md`](docs/security/auth.md) for providers, Turnstile, MFA, redirect URLs, and the Andrew dashboard checklist.

Bootstrap the first platform admin (local / staging only, after migration `0005`):

```sh
bun scripts/bootstrap-platform-admin.ts
```

Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PLATFORM_ADMIN_EMAIL`, and `PLATFORM_ADMIN_NAME`. Do not put the platform-admin env vars on Vercel.

## Deploy

`main` deploys to Vercel (Nitro preset `vercel`). Pull requests get Vercel preview deployments.
