# Demo account (ADR-062)

The Clarke Piano Studio demo is the in-browser sample data in `src/mocks` (students, families,
invoices, Pro CFO). It is shown to:

- platform staff with no studio role (Keystone admin > **Open demo studio**, or the home address), and
- anyone whose only studio memberships are in a studio marked `studio.is_demo = true`.

The demo account is a normal Supabase user that belongs **only** to the demo studio. It signs in
at **`/demo`** with an email and password (a "Demo studio" link sits in the sign-in page footer).

## What keeps it contained

- `resolveAccountForUser` sets `demoOnly` only when every studio membership is an `is_demo` studio,
  the user is not platform staff and not a guardian anywhere. Add the account to a real studio and
  `demoOnly` turns off: password sign-in is then refused and two-step sign-in applies again.
- A password session for any account that is not `demoOnly` is signed out (`/demo` page and
  `LiveAuthGuard`, using the JWT `amr` claim). Real people keep signing in with an email link,
  Google or Microsoft.
- The demo account skips the app's two-step gate, so its session stays at `aal1`. Every staff
server route still demands `aal2` (`requireStudioRole`), so the demo account can't invite
people, send emails, sync calendars or change anything on the server. It only sees the demo
fixtures, which live in the browser and reset on reload.

The same app-level session timeout as every other account applies (30 minutes idle, 8 hours
absolute — see `docs/security/auth.md`). There is no keep-alive exception for the demo.
- RLS is unchanged: it can read only its own (demo) studio's rows.
- Turnstile (CAPTCHA) protects the `/demo` form as it does `/login`.

## One-time setup (Supabase dashboard)

Never put the password in the repo, a doc or chat. Keep it in a password manager.

1. **Authentication > Users > Add user > Create new user.** Email: a Keystone mailbox you control,
   for example `demo@keystonemusichq.com` (an alias of support@ is fine). Set a long random
   password. Tick **Auto confirm user**.
2. **SQL editor**, check whether the demo studio row exists:

   ```sql
   select id, name, is_demo from public.studio where is_demo or name ilike '%clarke%';
   ```

   If there is none, create it (the 0006 trigger adds a subscription row; the demo ignores it):

   ```sql
   insert into public.studio (name, is_demo) values ('Clarke Piano Studio (Demo)', true)
   returning id;
   ```

   If it exists but `is_demo` is false: `update public.studio set is_demo = true where id = '<id>';`

3. Link the demo user to the demo studio as owner (owner sees every screen, including Pro CFO):

   ```sql
   insert into public.studio_member (studio_id, user_id, role)
   select s.id, u.id, 'owner'
   from public.studio s, auth.users u
   where s.is_demo and u.email = 'demo@keystonemusichq.com'
   on conflict do nothing;
   ```

4. Check it is demo-only (should return one row, `is_demo = true`):

   ```sql
   select s.name, s.is_demo, m.role
   from public.studio_member m join public.studio s on s.id = m.studio_id
   join auth.users u on u.id = m.user_id
   where u.email = 'demo@keystonemusichq.com';
   ```

5. Open `https://keystonemusichq.com/demo`, sign in, and confirm the "Demo studio" label shows.

To change the password: Authentication > Users > the demo user > **Send password recovery**, or
delete and re-create the user and repeat step 3. To switch the demo off: delete the demo user.
