# Help centre and support requests

Goal: fewer support tickets. People see answers before they can write to us.

## Where it lives

- `/help` (public, no session): studio FAQ and family FAQ (English + 中文), plus a signed-out
  request form with a Cloudflare Turnstile check. The login page "Help" link already points here.
- `/support` (in the app shell, Help button in the header): studio FAQ + signed-in request form.
- Family portal: Help / 帮助 button beside the language switch opens the family FAQ + form.
- `/admin` → Support tab: platform admins list, close and reopen requests.

Articles: `src/lib/help/articles.ts`. Only describe features that are live. Search:
`src/lib/help/search.ts` (title > keywords > body; Chinese split into two-character pieces).

## Deflection

1. Search box filters articles as the person types.
2. While writing a request, up to 3 matching articles appear above the Send button.
3. Family categories about lessons, fees/refunds and progress (`answeredBy: "studio"`) don't
   create a ticket. The form shows "Message your teacher", which opens family Chat prefilled.
   The server refuses those categories too (`ask_studio`). This follows family app terms A1/A5:
   the studio answers lessons, fees and refunds; Keystone answers the app.
4. Each request records which articles were shown (`suggested_article_ids`), so we can see
   which FAQs aren't working.

## Server (`src/server/support.ts`)

- Signed in: identity comes from the verified JWT and `resolveAccountForUser`, never the body.
- Signed out: email required + Turnstile.
- Rate limit: 5 per 15 minutes per IP and per user (in-memory per instance, like `rate-limit.ts`).
- Stored in `support_request` (migration 0007) with the service key, then emailed to
  `SUPPORT_EMAIL` from `EMAIL_FROM` (Resend) with Reply-To = requester. The requester gets an
  acknowledgement with a `KS-XXXXXX` reference (Chinese if they wrote from the Chinese portal).
- If the insert fails the email still goes; if both fail the person sees an error.

## Privacy

- No student or family records are attached. Added context: role, studio id/name, app path.
- The page path drops query strings and hashes, and `/join/`, `/intake/` and `/auth/` paths are
  cut to their first segment (they carry tokens).
- The form asks people not to include children's details, passwords or codes.
- `support_request` is Keystone Data (support records), not Studio Data, so it is not under the
  0006 `access_gate` policies: a paused studio's owner can still reach support.
- RLS: requester reads own rows; platform admins (aal2) read all; writes are service-role only.
- Retention: family app terms C8 "support record period" is still a placeholder. `closed_at` is
  recorded; a deletion job is still to be built once the period is decided.
