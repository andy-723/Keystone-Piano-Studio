# Lesson calendar and Google Calendar push (0010)

## What is stored

| Table | Holds | Who can read | Who can write |
| --- | --- | --- | --- |
| `lesson_series` | One student's lesson slot: weekly or once, first date, optional last date, local start time, length, optional place and note, Google sync status | Owner/admin/teacher of the studio; guardians for their own students | Owner/admin/teacher (RLS), server code after `requireStudioRole` |
| `lesson_exception` | One week of a series cancelled or moved (unique per series + date) | Same as above | Same as above |
| `calendar_connection` | A staff member's Google link: Google email, Keystone calendar id, status, Vault secret id | The person themselves; studio owner/admin (status columns only) | Service-role server code only |

Times are local date + time in `studio.timezone`, never UTC, so a 4 pm lesson stays at 4 pm across
daylight saving. A trigger refuses lessons for a student in another studio. All three tables are
under the 0006 `access_gate_*` policies.

The Google refresh token is stored in Supabase Vault. Only the service role can call
`calendar_connection_save`, `calendar_connection_refresh_token` and `calendar_connection_forget`;
the browser never sees the secret id or the token. Access tokens live in server memory for up to an
hour.

## Google Calendar: one way, Keystone is the source of truth

- Scope: `openid email https://www.googleapis.com/auth/calendar.app.created`. Keystone creates a
  secondary calendar called "Keystone lessons" and can only manage that calendar. It cannot read
  the teacher's other calendars or free/busy.
- Each weekly series is one recurring Google event (`RRULE:FREQ=WEEKLY`, `UNTIL` from the last
  lesson) with an `EXDATE` per cancelled or moved week. Each moved week is its own event. Event ids
  are `ks` + series uuid hex and `km` + exception uuid hex, so pushes are idempotent PUTs.
- Event title is "Piano lesson: First L." (first name, last initial). No family, contact or note
  details are sent. The description links back to the Keystone calendar.
- Every lesson change pushes straight away. If Google fails, the lesson change still saves, the
  series shows "error", and "Sync now" retries. If Google returns `invalid_grant` the connection is
  marked `needs_reconnect` and the calendar asks the teacher to reconnect.
- "Stop syncing" revokes the token at Google and deletes the Vault secret. The "Keystone lessons"
  calendar stays in the teacher's Google account until they delete it.
- Changes made in Google are not read back and are overwritten on the next push.

OAuth state is HMAC-signed with the client secret, expires after 10 minutes and carries the
Keystone user id; `/calendar/google` only finishes the link when the signed-in user matches.

## Set up (dashboard steps)

1. Google Cloud console, same project as the Google sign-in client: APIs & Services > Library >
   Google Calendar API > Enable.
2. Google Auth Platform > Data access > Add or remove scopes: add
   `https://www.googleapis.com/auth/calendar.app.created`. Save.
3. Google Auth Platform > Clients > the Web client: add the redirect URI
   `${APP_URL}/calendar/google` for each environment. Save.
4. Google Auth Platform > Audience: while the app is in Testing, add each teacher's Google account
   as a test user. Testing-mode refresh tokens expire after 7 days, so publish the app before the
   pilot relies on it, then submit for verification.
5. Vercel > Settings > Environment Variables: `GOOGLE_CALENDAR_CLIENT_ID`,
   `GOOGLE_CALENDAR_CLIENT_SECRET`. Redeploy.
6. Supabase: apply `0010_lesson_calendar.sql`. Vault (`supabase_vault`) must be enabled.

Without the two env vars the calendar works and shows "Google Calendar sync isn't switched on".

## Not yet

- Busy times from Google (two-way) — deferred by decision on 10 Nov 2026.
- Calendar cancellations don't create make-up credits or change invoices; the demo day-book on
  Today still reads mock data.
- School-holiday skipping for weekly lessons.
