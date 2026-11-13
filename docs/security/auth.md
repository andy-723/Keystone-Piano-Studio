# Authentication — Keystone Music HQ

Live sign-in uses Supabase Auth (Sydney). Mock mode (`ONBOARDING_BACKEND` not `supabase`, or missing Supabase env) keeps the demo role switcher and does not require a real session.

## Providers

| Provider | Supabase provider id | Notes |
| --- | --- | --- |
| Google | `google` | OAuth web client; redirect to Supabase callback URL |
| Microsoft | `azure` | Entra app for any org + personal accounts; request `email` scope |
| Email | magic link OTP | `signInWithOtp` with `shouldCreateUser: false` — invite-only (ADR-017). No passwords (ADR-018). |

### Microsoft / Azure settings to use in the dashboard

- Tenant URL / authority: use Supabase’s Azure provider “Tenant URL” field with `https://login.microsoftonline.com/common` (multi-tenant + personal accounts), matching the Entra app registration audience.
- Enable **email claim** verification so the `email` claim is present and marked verified before Keystone accepts the session.
- Redirect URI in Entra: the Supabase Auth callback URL shown under Authentication → Providers → Azure.

## Redirect URLs

- Site URL: production Vercel app URL (`APP_URL`).
- Additional redirect URLs: `https://<app>/auth/callback`, `http://127.0.0.1:3000/auth/callback` (local).
- App OAuth / OTP `redirectTo` / `emailRedirectTo`: `{APP_URL}/auth/callback` (optional safe `?next=` path).

## CAPTCHA (Turnstile)

- App site key: `VITE_TURNSTILE_SITE_KEY` (Vercel + local).
- Secret: `TURNSTILE_SECRET_KEY` (server + Supabase Attack Protection).
- Email OTP passes `captchaToken` so Supabase validates Turnstile when captcha is enabled in the dashboard.
- Server functions that already call `verifyTurnstile` keep doing so for invitation / intake paths.

## MFA (TOTP)

- **Required** for platform staff and every studio owner, admin and teacher.
- **Optional** for guardians (card in the family portal).
- After `/auth/callback`, the app checks `mfa.getAuthenticatorAssuranceLevel()` / JWT `aal` and verified TOTP factors.
  - No verified factor → `/auth/mfa-setup`
  - Factor present but `aal1` → `/auth/mfa`
- Server gates: `requirePlatformAdmin` and live `requireStudioRole` for staff roles require `aal === "aal2"` or throw a 403 problem with `code: "mfa_required"` (UI redirects to `/auth/mfa`).
- Database backstop (this PR): `platform_staff` and `platform_audit` RLS require `(auth.jwt() ->> 'aal') = 'aal2'`.
- **Follow-up:** add the same aal2 check to studio-table RLS (not changed beyond 0003 here).

### MFA reset

A platform admin can reset another user’s TOTP from `/admin` → Team (type the user’s email to confirm). That deletes factors via the Auth Admin API, signs them out globally, and writes `platform_audit` `mfa_reset`. Once there is a second platform admin, prefer a two-person check (one admin requests, another confirms) before resetting.

## Sessions

Follow Supabase defaults for access / refresh tokens. **Recommended inactivity timeout for Andrew to set in the dashboard:** 7–14 days refresh token reuse / inactivity (studio staff leave devices signed in between lessons; shorter than consumer apps is fine). Leave the actual dashboard toggle to Andrew — document the choice here when set.

### App-level session timeout (all accounts)

The browser also enforces shorter lifetimes so a restored Supabase session (or the
demo/prototype path) cannot stay signed in indefinitely. Applies equally to real
accounts and the demo account — no keep-alive exception.

| Timer | Default | Behaviour |
| --- | --- | --- |
| Idle | **30 minutes** without clicks, keypresses or navigation | Signs out |
| Absolute | **8 hours** from sign-in | Signs out even if the person stays active |

Implementation: `src/lib/session-timeout.ts`, watched by `SessionTimeout` inside
`LiveAuthGuard`. On timeout the app calls `signOut({ scope: "local" })`, clears the
verified-access cache and session markers, and redirects to `/login` or `/welcome`
with `?reason=session_timeout` (no silent re-auth from leftover storage).

Sign-out (live mode) uses `signOut({ scope: "local" })` and returns to `/login`.

## No-account behaviour

If the verified user has no `platform_staff` row, no `studio_member` row, and no guardian family, the app signs them out globally, writes `platform_audit` `sign_in_no_account`, and shows:

> We couldn't find a Keystone Music HQ account for this sign-in. If your teacher invited you, use the same email address the invite was sent to.

Email OTP always shows “Check your inbox” whether or not the address exists (`shouldCreateUser: false`), so the form cannot be used to probe registered emails.

## Platform admin model

- Table `platform_staff` (`platform_admin` | `support`) and append-only `platform_audit`.
- Bootstrap once with `bun scripts/bootstrap-platform-admin.ts` (env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_NAME`). Idempotent; refuses a second admin via the script — add further staff from `/admin`.
- Platform staff are **not** studio members and have **no** access to studio data. ADR-019 (time-limited support grants) remains proposed / out of scope.
- `/admin` (live only): Studios, New studio, Team, Audit.

## Dashboard checklist (Andrew)

1. Authentication → turn **off** “Allow new users to sign up”.
2. Enable Email with confirm email; configure Google and Azure providers with client IDs/secrets.
3. URL Configuration: site URL + redirect URLs above.
4. Attack Protection: CAPTCHA = Cloudflare Turnstile (secret key).
5. Multi-Factor: enable TOTP (App Authenticator).
6. Vercel: `SUPPORT_EMAIL` (not `PLATFORM_ADMIN_*` — those are script-only on your machine).
7. After applying migration `0005` locally/staging, run the bootstrap script once, sign in at `/login`, enrol MFA.
8. Branded auth emails from `noreply@keystonemusichq.com` (Resend SMTP + templates): follow `docs/security/auth-emails.md`.

## Follow-ups

- aal2 required in studio RLS (families, students, invoices, chat).
- ADR-019 support access grants.
- WebAuthn / passkeys.
