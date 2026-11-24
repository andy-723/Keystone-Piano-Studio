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

Supabase keeps the session (access token about 1 hour, refresh token rotated). The app sets the
lifetime in the browser and, for trusted devices, on the server.

### App-level session timeout (all accounts)

| Browser | Idle | Absolute |
| --- | --- | --- |
| Not trusted (default, shared computers) | **30 minutes** without clicks, keypresses or navigation | **8 hours** from sign-in |
| Trusted ("Trust this device for 30 days") | **7 days** without use | until the trust ends, **30 days** from when it was trusted |

Implementation: `src/lib/session-timeout.ts` (`sessionLimits()`), watched by `SessionTimeout`
inside `LiveAuthGuard`. On timeout the app calls `signOut({ scope: "local" })`, clears the
verified-access cache and session markers, and redirects to `/login` or `/welcome` with
`?reason=session_timeout`. Applies equally to real accounts and the demo account.

### Trusted devices (0029, Andrew 24 Nov 2026)

- Tick box (unticked by default) on `/login`, the email-link Continue screen (`/auth/callback`)
  and the code screen (`/auth/mfa`); `TrustDeviceCheckbox`, choice in `src/lib/trust-device-client.ts`.
  When sign-in finishes (code entered for staff; at once for families with no code) the app calls
  `trustThisDeviceFn`.
- Server (`src/server/trusted-device.ts`, service role only): a random 32-byte token goes in the
  `kmhq_trusted_device` cookie (httpOnly, Secure, SameSite=Lax, 30 days); `trusted_device` stores
  only its SHA-256 hash, the user id, a short label ("Chrome on Mac"), last seen and expiry.
  Staff (platform staff or studio members) can only trust a browser from an aal2 session.
- `LiveAuthGuard` asks the server once per page load (`checkThisDeviceFn`): trusted means the row
  is this user's, not revoked, not expired and seen in the last 7 days. The answer sets which
  limits the browser timer uses. A dead cookie is cleared; another person's cookie is left alone.
- Trust keeps the existing Supabase session alive. It does not skip the code on a brand-new
  sign-in: aal2 comes only from Supabase after the TOTP code.
- Ends trust: Sign out (that browser), "Sign out other devices" in Settings / family Help (every
  other browser, plus `signOut({ scope: "others" })` for every other Supabase session), revoke
  access (staff, owner, parent), removal from the platform team, MFA reset (every browser).
  Rules are pure in `src/lib/trusted-device.ts`.

### Re-asking for the code on sensitive actions (step-up)

The JWT `amr` "totp" timestamp says when the code was last entered in this session. Sensitive
server actions call `requireRecentMfa(session)` (`src/server/authz.ts`), which needs that to be
within **10 minutes**, trusted device or not, or throws 403 `mfa_step_up_required`:
Stripe link/unlink, Xero connect/disconnect, revoke/restore staff, owner or parent access, remove
platform staff, MFA reset. In the browser `ensureRecentMfa()` / `sensitiveAccessToken()`
(`src/lib/step-up.ts`) open `StepUpDialog` first and re-verify with `mfa.challengeAndVerify`,
which refreshes the timestamp. CSV exports (billing, Snapshot, Tax Lite, Pro CFO) use the same
prompt in the browser only (the data is already on screen). Bank details keep their own code box.

### Supabase dashboard (Andrew)

Authentication → Sessions (time-box and inactivity timeout are Pro-plan settings):
- **Time-box user sessions: 30 days** (720 hours) — a hard server-side end for every session,
  matching the longest trusted device. Never shorter than 30 days or trusted devices stop early.
- **Inactivity timeout: 7 days** (168 hours) — server-side backstop for the 7-day idle rule.
- **Single session per user: off** (people use a phone and a laptop).
- Leave refresh token rotation on, and the reuse interval at the default 10 seconds.
- JWT expiry (Settings → JWT): leave at 3600 seconds.
If those settings aren't available on the current plan, the app-level rules above still apply.

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
