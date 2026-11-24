-- 0029 trusted devices (24 Nov 2026).
-- "Trust this device for 30 days" (Andrew, 24 Nov 2026). When someone ticks the box at sign-in,
-- the server stores a row here and sets a random token in a secure httpOnly cookie on that
-- browser. Only the SHA-256 hash of the token is stored, so a copy of this table can't be used
-- to trust a browser. A trusted browser keeps its Supabase session for up to 30 days instead of
-- the 8-hour limit, and is signed out after 7 days without use.
-- Sign out, "Sign out other devices", revoke access and an MFA reset set revoked_at.
-- Server only: RLS on and no policies, so only the service role (src/server/trusted-device.ts)
-- reads or writes it. Expand-only: one new table; the app treats a missing table as "not trusted".

create table public.trusted_device (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  -- Short label for the "Signed-in devices" list, e.g. "Chrome on Mac". Never the full user agent.
  label text not null default 'Browser' check (char_length(label) between 1 and 80),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '31 days')
);
create index trusted_device_user_idx on public.trusted_device (user_id) where revoked_at is null;

alter table public.trusted_device enable row level security;
revoke all on table public.trusted_device from anon, authenticated, public;

notify pgrst, 'reload schema';
