-- Notification emails (0018): unread chat, news posts and shared marking feedback, by email.
--
-- Andrew, 11 Nov 2026: families and studios should hear about unread chat, news and teacher
-- marking by email, in the same branded template as the sign-in emails, at no cost.
--
-- * notification_preference: one row per person (auth user) with an on/off switch for each kind
--   and the token used by the one-click unsubscribe link. People read and change their own row.
-- * notification_log: one row per email sent. The unique key stops the same thing being emailed
--   twice (a chat is emailed once until it is read, a news post once, a summary once a day).
--   Service key only: no client policies.
-- * notify_*_candidates(): what is waiting to be emailed, already filtered by preference, demo
--   studios, example families and the log. Service key only (the 15-minute job calls them).
--
-- Nothing here sends email or schedules anything. The job is /api/cron/notifications, called by
-- pg_cron + pg_net (see docs/security/notifications.md; the schedule holds a secret, so it is set
-- up by hand, not in this file). Expand only.

create table public.notification_preference (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_email boolean not null default true,
  news_email boolean not null default true,
  marking_email boolean not null default true,
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid references public.studio(id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('chat', 'news', 'digest')),
  -- chat: oldest unread message id; news: post id; digest: studio id + studio-local date.
  dedupe_key text not null,
  status text not null default 'sending' check (status in ('sending', 'sent')),
  resend_id text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, dedupe_key)
);

create index notification_log_created_idx on public.notification_log (created_at);

alter table public.notification_preference enable row level security;
alter table public.notification_log enable row level security;
revoke all on table public.notification_preference, public.notification_log from anon, public, authenticated;
grant select, insert, update on table public.notification_preference to authenticated;
grant all on table public.notification_preference, public.notification_log to service_role;

-- People see and change only their own switches. The token is not theirs to choose.
create policy notification_preference_own_select on public.notification_preference
  for select to authenticated using (user_id = app_private.current_user_id());
create policy notification_preference_own_insert on public.notification_preference
  for insert to authenticated with check (user_id = app_private.current_user_id());
create policy notification_preference_own_update on public.notification_preference
  for update to authenticated
  using (user_id = app_private.current_user_id())
  with check (user_id = app_private.current_user_id());

create or replace function app_private.notification_preference_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.unsubscribe_token := old.unsubscribe_token;
    new.user_id := old.user_id;
  elsif current_user = 'authenticated' then
    new.unsubscribe_token := gen_random_uuid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger notification_preference_guard before insert or update on public.notification_preference
  for each row execute function app_private.notification_preference_guard();

-- Every recipient needs a token for the unsubscribe link. Returns one row per user id.
create or replace function public.notify_ensure_preferences(p_user_ids uuid[])
returns table (user_id uuid, unsubscribe_token uuid, chat_email boolean, news_email boolean, marking_email boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  insert into public.notification_preference (user_id)
  select distinct u.id from unnest(p_user_ids) as ids(id) join auth.users u on u.id = ids.id
  on conflict (user_id) do nothing;
  return query
    select p.user_id, p.unsubscribe_token, p.chat_email, p.news_email, p.marking_email
    from public.notification_preference p where p.user_id = any(p_user_ids);
end;
$$;

-- Unread chat older than p_min_age (and newer than p_max_age), one row per recipient and
-- conversation. Teacher messages go to the family's signed-up guardians; family messages go to
-- the studio's owner and teachers. The key is the oldest unread message, so a chat is emailed
-- once and not again until someone reads it and a new message arrives.
create or replace function public.notify_chat_candidates(p_min_age interval, p_max_age interval)
returns table (
  studio_id uuid, studio_name text, timezone text,
  conversation_id uuid, family_id uuid, family_name text,
  direction text, oldest_unread_id uuid, unread_count int, latest_author text,
  recipient_user_id uuid, recipient_email text, recipient_name text, recipient_lang text
)
language sql
stable
security definer
set search_path = ''
as $$
  with unread as (
    select m.studio_id, m.conversation_id,
           case when m.author_role = 'teacher' then 'to_family' else 'to_studio' end as direction,
           m.id, m.sent_at, m.author_name
    from public.message m
    where m.read_at is null
      and m.sent_at > now() - p_max_age
  ),
  grouped as (
    select u.studio_id, u.conversation_id, u.direction,
           (array_agg(u.id order by u.sent_at, u.id))[1] as oldest_unread_id,
           min(u.sent_at) as oldest_sent_at,
           count(*)::int as unread_count,
           (array_agg(u.author_name order by u.sent_at desc))[1] as latest_author
    from unread u
    group by u.studio_id, u.conversation_id, u.direction
    having min(u.sent_at) < now() - p_min_age
  ),
  base as (
    select g.*, s.name as studio_name, s.timezone, c.family_id, f.display_name as family_name
    from grouped g
    join public.studio s on s.id = g.studio_id and not s.is_demo
    join public.conversation c on c.id = g.conversation_id
    join public.family f on f.id = c.family_id and not f.is_example
  ),
  recipients as (
    select b.*, gu.user_id as recipient_user_id, gu.email as recipient_email,
           gu.full_name as recipient_name, gu.preferred_language as recipient_lang
    from base b
    join public.guardian gu on gu.family_id = b.family_id and gu.user_id is not null
    where b.direction = 'to_family'
    union all
    select b.*, sm.user_id, au.email::text, coalesce(au.raw_user_meta_data->>'full_name', ''), 'en'
    from base b
    join public.studio_member sm on sm.studio_id = b.studio_id and sm.role in ('owner', 'teacher')
    join auth.users au on au.id = sm.user_id and au.email is not null
    where b.direction = 'to_studio'
  )
  select r.studio_id, r.studio_name, r.timezone, r.conversation_id, r.family_id, r.family_name,
         r.direction, r.oldest_unread_id, r.unread_count, r.latest_author,
         r.recipient_user_id, r.recipient_email, r.recipient_name, r.recipient_lang
  from recipients r
  left join public.notification_preference p on p.user_id = r.recipient_user_id
  where coalesce(p.chat_email, true)
    and not exists (
      select 1 from public.notification_log l
      where l.user_id = r.recipient_user_id and l.kind = 'chat' and l.dedupe_key = r.oldest_unread_id::text
    );
$$;

-- Families a news post is for (studio, chosen families / my students, or groups).
create or replace function app_private.news_post_family_ids(p public.news_post)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select f.id from public.family f
  where f.studio_id = p.studio_id and not f.is_example
    and (
      coalesce(p.audience->>'kind', 'studio') = 'studio'
      or (p.audience->>'kind' in ('families', 'my_students')
          and f.id::text in (select jsonb_array_elements_text(coalesce(p.audience->'familyIds', '[]'::jsonb))))
      or (p.audience->>'kind' = 'groups' and f.id in (
          select st.family_id from public.student st
          join public.student_group g on g.studio_id = p.studio_id and st.id = any(g.student_ids)
          where g.id::text in (select jsonb_array_elements_text(coalesce(p.audience->'groupIds', '[]'::jsonb)))
        ))
    );
$$;

-- News posts that went live after p_since, one row per signed-up guardian in the audience.
create or replace function public.notify_news_candidates(p_since timestamptz)
returns table (
  studio_id uuid, studio_name text, timezone text, post_id uuid, title text, author_name text,
  important boolean, publish_at timestamptz, family_id uuid,
  recipient_user_id uuid, recipient_email text, recipient_name text, recipient_lang text
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.studio_id, s.name, s.timezone, n.id, n.title, n.author_name, n.important, n.publish_at,
         gu.family_id, gu.user_id, gu.email, gu.full_name, gu.preferred_language
  from public.news_post n
  join public.studio s on s.id = n.studio_id and not s.is_demo
  join lateral app_private.news_post_family_ids(n) as fam(id) on true
  join public.guardian gu on gu.family_id = fam.id and gu.user_id is not null
  left join public.notification_preference p on p.user_id = gu.user_id
  where n.status in ('published', 'scheduled')
    and n.publish_at > p_since and n.publish_at <= now()
    and (n.expires_at is null or n.expires_at > now())
    and coalesce(p.news_email, true)
    and not exists (
      select 1 from public.notification_log l
      where l.user_id = gu.user_id and l.kind = 'news' and l.dedupe_key = n.id::text
    );
$$;

-- Feedback the teacher shared with the family after p_since, counted per student.
create or replace function public.notify_marking_candidates(p_since timestamptz)
returns table (
  studio_id uuid, studio_name text, timezone text, family_id uuid, student_id uuid,
  student_first_name text, feedback_count int,
  recipient_user_id uuid, recipient_email text, recipient_name text, recipient_lang text
)
language sql
stable
security definer
set search_path = ''
as $$
  with shared as (
    select c.studio_id, c.student_id, count(*)::int as feedback_count
    from public.student_course c
    cross join lateral jsonb_array_elements(coalesce(c.data->'feedback', '[]'::jsonb)) as fb(entry)
    where c.updated_at > p_since
      and coalesce((fb.entry->>'shared')::boolean, false)
      and (fb.entry->>'createdAt') ~ '^\d{4}-\d{2}-\d{2}T'
      and (fb.entry->>'createdAt')::timestamptz > p_since
    group by c.studio_id, c.student_id
  )
  select sh.studio_id, s.name, s.timezone, st.family_id, st.id, st.first_name, sh.feedback_count,
         gu.user_id, gu.email, gu.full_name, gu.preferred_language
  from shared sh
  join public.studio s on s.id = sh.studio_id and not s.is_demo
  join public.student st on st.id = sh.student_id and not st.is_example
  join public.guardian gu on gu.family_id = st.family_id and gu.user_id is not null
  left join public.notification_preference p on p.user_id = gu.user_id
  where coalesce(p.marking_email, true);
$$;

-- Unsubscribe link: turn one kind off for the person holding the token. 'summary' is the daily
-- summary (news and feedback); 'all' is every notification email.
create or replace function public.notify_unsubscribe(p_token uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  hit int;
begin
  if p_kind not in ('chat', 'news', 'marking', 'summary', 'all') then
    raise exception 'Unknown notification kind' using errcode = '22023';
  end if;
  update public.notification_preference
     set chat_email = case when p_kind in ('chat', 'all') then false else chat_email end,
         news_email = case when p_kind in ('news', 'summary', 'all') then false else news_email end,
         marking_email = case when p_kind in ('marking', 'summary', 'all') then false else marking_email end
   where unsubscribe_token = p_token;
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

revoke all on function public.notify_ensure_preferences(uuid[]) from public, anon, authenticated;
revoke all on function public.notify_chat_candidates(interval, interval) from public, anon, authenticated;
revoke all on function public.notify_news_candidates(timestamptz) from public, anon, authenticated;
revoke all on function public.notify_marking_candidates(timestamptz) from public, anon, authenticated;
revoke all on function public.notify_unsubscribe(uuid, text) from public, anon, authenticated;
revoke all on function app_private.news_post_family_ids(public.news_post) from public, anon, authenticated;
grant execute on function public.notify_ensure_preferences(uuid[]) to service_role;
grant execute on function public.notify_chat_candidates(interval, interval) to service_role;
grant execute on function public.notify_news_candidates(timestamptz) to service_role;
grant execute on function public.notify_marking_candidates(timestamptz) to service_role;
grant execute on function public.notify_unsubscribe(uuid, text) to service_role;

notify pgrst, 'reload schema';
