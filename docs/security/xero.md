# Xero sync for Pro studios (0022)

A Pro studio owner connects their own Xero organisation. Every 15 minutes (and when they press
**Sync now**) Keystone sends Xero:

- each **sent** invoice (never drafts) as an approved sales invoice (ACCREC) with Keystone's
  invoice number, issue and due dates, and lines on the income account the studio picks
  (default 200 Sales). GST-registered studios: amounts are GST-inclusive, lessons use GST on
  Income (`OUTPUT`) and GST-free lines `EXEMPTOUTPUT`. Not registered: `NoTax`;
- the family as a Xero contact (matched by name first, so no duplicates);
- each payment (bank transfer, PayID, cash, card, Stripe) against that invoice, into the bank
  account the studio picks. Credits applied and reversals are not sent.

It is one-way. Not sent yet: credit notes, voids and edits after an invoice was sent (fix those
in Xero). Each record is sent once (`invoice.xero_invoice_id`, `payment.xero_payment_id`,
`family.xero_contact_id`), and every create carries an `Idempotency-Key`.

## Cost guard

Xero's developer pricing (developer.xero.com/pricing, checked 19 Nov 2026, AUD ex tax): **Starter
is free for up to 5 connected organisations**; Core A$35/month for up to 50; Plus A$245/month for
up to 1,000. Keystone refuses new connections once `XERO_MAX_CONNECTIONS` (default **5**) studios
are connected, and the studio sees "Xero connections are full, contact support". Raise it only
after moving the Xero app to a paid tier. Disconnecting a studio also removes the connection in
Xero, so it stops counting.

## Security

- OAuth 2.0 code flow. Only the studio **owner** with two-step sign-in, on **Pro**, can start it.
  The `state` is signed (HMAC, 15 minutes) and names the studio and owner; the callback trusts
  nothing else.
- Scopes: `offline_access accounting.invoices accounting.payments accounting.contacts
  accounting.settings.read`. Xero apps created on or after 2 March 2026 must use these granular
  scopes (`accounting.transactions` is not available to them).
- Access and refresh tokens are kept in Supabase Vault through `xero_connection_*` functions
  (service role only). The browser never sees them. Token refresh takes the 0003 lease
  (`claim_oauth_refresh`) and saves with a version check, so two workers never both rotate the
  refresh token. If Xero refuses the refresh token (unused for 60 days, or access removed in
  Xero), the connection shows **Reconnect Xero**.
- Owners and admins can see the status, account choices and last error; teachers can't.
- Base plan: nothing is sent (sync pauses; nothing is deleted).

## Setup steps (Andrew)

### 1. Xero developer portal

1. Sign in at developer.xero.com → **My Apps** → **New app**.
2. App name `Keystone Music HQ`, integration type **Web app**, company URL
   `https://www.keystonemusichq.com`, redirect URI
   `https://www.keystonemusichq.com/api/xero/callback` (exactly this). Tick the terms → **Create app**.
3. **Configuration**: copy the **Client id**, then **Generate a secret** and copy it straight away
   (Xero shows it once).
4. Leave the app on the free **Starter** tier. Don't add a card.

### 2. Vercel

1. Project → **Settings → Environment Variables** → add `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`
   (Production).
2. Leave `XERO_MAX_CONNECTIONS` unset (5). Only set it after moving to a paid Xero tier.
3. **Redeploy**.

### 3. Supabase

1. **SQL editor** → run `supabase/migrations/0022_xero_sync.sql` before merging.
2. Then schedule the sync (same pattern as the notification job; uses the `keystone_cron_secret`
   Vault secret you already created):

```sql
select cron.schedule(
  'keystone-xero-sync',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://www.keystonemusichq.com/api/cron/xero-sync',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'keystone_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
```

### 4. Test it

1. In Xero, use the **Demo Company (AU)** (free, resets every 28 days).
2. As a Pro studio owner: Settings → Integrations → **Connect Xero** → pick the Demo Company →
   **Allow access**. You come back to Settings with "Xero connected".
3. Pick the income account and the bank account → **Save accounts**.
4. Send a test invoice and record a payment, then **Sync now**. Check Xero → Sales → Invoices.
