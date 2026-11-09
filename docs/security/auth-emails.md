# Branded sign-in emails (Supabase Auth via Resend)

Supabase Auth sends the sign-in (magic link), invite, confirm, recovery, email-change and
reauthentication emails. By default they come from `noreply@mail.app.supabase.io` with Supabase
wording. This page makes them come from **Keystone Music HQ &lt;noreply@keystonemusichq.com&gt;**
with our logo, palette and copy, and makes every link point at `keystonemusichq.com`.

## What is in the repo

| File                                             | Purpose                                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `supabase/templates/*.html`                      | Branded templates (source of truth). Paste into the dashboard.                                                              |
| `supabase/config.toml` `[auth.email.template.*]` | Same templates + subjects for local `supabase start`.                                                                       |
| `public/email/keystone-music-hq-email-logo.png`  | Logo, flattened on paper `#FBF7EE` so it survives dark mode. Served at `{SITE_URL}/email/keystone-music-hq-email-logo.png`. |
| `src/routes/auth.callback.tsx`                   | Accepts `?token_hash=…&type=…`, shows a **Continue** button, then calls `verifyOtp`.                                        |

### Why links use `token_hash`

The default `{{ .ConfirmationURL }}` points at `hnqpjytxbaexgyuxcynj.supabase.co`, which looks
foreign next to our domain and, with the PKCE flow, only works in the same browser that asked for
the link. Templates instead link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=…`.
The callback waits for a tap before using the token so mail scanners (Outlook Safe Links, Defender)
that open links can't use it up. Links now work on any device.

| Template                   | `type`                              |
| -------------------------- | ----------------------------------- |
| Magic link, Confirm signup | `email`                             |
| Invite user                | `invite`                            |
| Reset password             | `recovery`                          |
| Change email address       | `email_change`                      |
| Reauthentication           | code only (`{{ .Token }}`), no link |

## Setup (one-off, in this order)

### 1. Resend: add the domain

1. Sign in at resend.com → **Domains** → **Add domain**.
2. Domain `keystonemusichq.com`, region **Tokyo (ap-northeast-1)** (closest to Australia) → **Add**.
3. Resend lists 3 records (an MX and a TXT on `send`, a TXT on `resend._domainkey`). Either click
   **Auto configure** → Cloudflare and approve, or add them by hand (step 2).

### 2. Cloudflare: DNS records (only if not auto-configured)

Cloudflare → `keystonemusichq.com` → **DNS** → **Records** → **Add record**, once per row Resend shows.
Copy name and value exactly from Resend; Cloudflare adds the domain to the name for you.

| Type | Name                | Value                                         | Notes                                                           |
| ---- | ------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| MX   | `send`              | from Resend (`feedback-smtp.….amazonses.com`) | priority 10                                                     |
| TXT  | `send`              | `v=spf1 include:amazonses.com ~all`           |                                                                 |
| TXT  | `resend._domainkey` | long `p=…` key from Resend                    |                                                                 |
| TXT  | `_dmarc`            | `v=DMARC1; p=none;`                           | add yourself; tighten to `p=quarantine` after a few clean weeks |

TXT and MX records are always **DNS only** (grey cloud). These sit on `send.` and `_domainkey`,
so they don't clash with the Vercel A/CNAME records or any future Google Workspace MX on the root.

Back in Resend click **Verify DNS records** and wait for **Verified** (usually minutes).

### 3. Resend: API key for Supabase

Resend → **API Keys** → **Create API key**: name `Supabase Auth SMTP`, permission **Sending access**,
domain `keystonemusichq.com`. Copy it now (shown once). Keep it separate from the app's
`RESEND_API_KEY` so each can be rotated on its own. Don't paste it into chat or git.

### 4. Vercel: check the logo URL

After this PR is merged and deployed, open
`https://keystonemusichq.com/email/keystone-music-hq-email-logo.png`. It must load without a login.
If the domain isn't live yet, use the `keystone-piano-studio.vercel.app` URL in step 5.1 for now;
the templates follow the Site URL automatically.

### 5. Supabase dashboard (project `hnqpjytxbaexgyuxcynj`)

1. **Authentication → URL Configuration**
   - Site URL: `https://keystonemusichq.com`
   - Redirect URLs: add `https://keystonemusichq.com/auth/callback` (keep the vercel.app one).
2. **Authentication → Emails → SMTP Settings** → turn on **Enable custom SMTP**
   - Sender email `noreply@keystonemusichq.com`, sender name `Keystone Music HQ`
   - Host `smtp.resend.com`, port `465`, username `resend`, password = the key from step 3
   - Minimum interval between emails: `60` seconds → **Save**.
3. **Authentication → Rate Limits**: custom SMTP starts at 30 emails/hour. Raise to `100` for the pilot.
4. **Authentication → Emails → Templates**: for each tab, set the subject and paste the whole file:

   | Tab                  | Subject                                      | File                    |
   | -------------------- | -------------------------------------------- | ----------------------- |
   | Confirm signup       | Confirm your email for Keystone Music HQ     | `confirmation.html`     |
   | Invite user          | You're invited to Keystone Music HQ          | `invite.html`           |
   | Magic Link           | Your Keystone Music HQ sign-in link          | `magic_link.html`       |
   | Change Email Address | Confirm your new email for Keystone Music HQ | `email_change.html`     |
   | Reset Password       | Get back into Keystone Music HQ              | `recovery.html`         |
   | Reauthentication     | Your Keystone Music HQ verification code     | `reauthentication.html` |

   Open the raw file on GitHub (Raw button), select all, paste into the **Source** box, **Save**.

5. **Authentication → Sign In / Providers → Email**: Email OTP Expiration `3600` (the emails say
   "expires in 1 hour"; change the copy if you change this).

### 6. Test

1. Sign out, go to `/login`, enter your email, pass the CAPTCHA.
2. The email should be from **Keystone Music HQ &lt;noreply@keystonemusichq.com&gt;**, show the logo,
   and the button link should start with `https://keystonemusichq.com/auth/callback?token_hash=`.
3. Tap the button → **Continue** → you land in the app (MFA challenge first for staff).
4. In Gmail, ⋮ → **Show original**: SPF, DKIM and DMARC should all say **PASS**.
5. Opening the same link a second time should say it has expired or was already used.

## Changing the wording

Edit the file in `supabase/templates/`, then paste it into the matching dashboard tab. The repo
copy is the source of truth; the dashboard does not sync from git.
