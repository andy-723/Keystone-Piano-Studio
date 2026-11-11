# Notification emails (0018)

Families and studios get an email when something is waiting in Keystone. Same branded frame as
the sign-in emails (`supabase/templates/magic_link.html`), sent through Resend from `EMAIL_FROM`.

| What | Who gets it | When |
| --- | --- | --- |
| Unread chat from the teacher | The family's signed-up guardians | Unread for 15 minutes. Once per chat until it is read. |
| Unread chat from a family | Studio owner and teachers | Unread for 15 minutes. Once per chat until it is read. |
| News post marked important | Signed-up guardians in the post's audience | When it goes live |
| Other news posts + teacher feedback shared with the family | Signed-up guardians | 7am daily update (studio time), only if there's something new |

Rules:

- **No message text, no child names.** Emails say who wrote and how many. People sign in to read.
  (Andrew, 11 Nov 2026.)
- **Quiet hours** 9pm to 7am in `studio.timezone`. Waiting emails go out on the first run after 7am.
- **Demo studios** (`is_demo`) and **example families** never get emails. Guardians who haven't
  accepted their invite (no `user_id`) get none.
- **Switches:** each person's own row in `notification_preference` (chat, news, feedback). Studio
  staff see a chat switch under Settings; families see all three under Help in the family portal.
  Every email has an unsubscribe link (`/api/notifications/unsubscribe`, confirm page on GET,
  change on POST) and `List-Unsubscribe` + `List-Unsubscribe-Post` headers for one-click
  unsubscribe in Gmail and Apple Mail.
- **Daily cap:** `NOTIFY_DAILY_LIMIT` (default 70) per rolling 24 hours. Resend's free plan allows
  100 emails a day and 3,000 a month, and Supabase sign-in emails use the same Resend account.
  Order: chat, then important news, then daily updates. Anything over the cap waits for the next
  run (a daily update that misses its 7am hour is skipped). Move to a paid Resend plan before the
  cap starts holding emails back (about 3 or more active studios).

## How it runs

`GET /api/cron/notifications` with `Authorization: Bearer CRON_SECRET`, every 15 minutes. Vercel's
free (Hobby) plan only runs cron jobs once a day, so Supabase calls it instead with pg_cron +
pg_net (both free on every Supabase plan).

### One-time setup (Supabase dashboard, production project)

1. Apply migration `0018_notification_emails.sql` (SQL editor), then merge the PR.
2. Database > Extensions: enable `pg_cron` and `pg_net`.
3. SQL editor, replacing the two placeholders (the secret is the same value as Vercel's
   `CRON_SECRET`; it is stored in Vault, never in the schedule text):

```sql
select vault.create_secret('<CRON_SECRET value>', 'keystone_cron_secret');

select cron.schedule(
  'keystone-notifications',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := '<APP_URL>/api/cron/notifications',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'keystone_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);
```

4. Check it: after 15 minutes, `select status_code, content from net._http_response order by created desc limit 5;`
   should show `200` and `{"ok":true,...}`. `401` means the secret doesn't match Vercel's.
5. Optional in Vercel: `NOTIFY_DAILY_LIMIT` (default 70).

To stop it: `select cron.unschedule('keystone-notifications');`

## Data

- `notification_preference` (user_id, chat_email, news_email, marking_email, unsubscribe_token):
  RLS, people read and change only their own row; the token can't be chosen or changed.
- `notification_log` (user_id, studio_id, kind, dedupe_key, status, resend_id): service key only.
  Unique on (user_id, kind, dedupe_key): chat = oldest unread message id, news = post id,
  digest = studio id + local date. A row is claimed (`sending`) before sending and removed if
  Resend fails, so the next run retries; claims older than an hour are cleared.
- `notify_chat_candidates`, `notify_news_candidates`, `notify_marking_candidates`,
  `notify_ensure_preferences`, `notify_unsubscribe`: security definer, `service_role` only.
- Tests: `supabase/tests/notification-emails.test.sql`, `src/test/notification-emails.test.ts`.

## Later

Free browser/phone push (web push) once the app is installable. No SMS (project decision).
