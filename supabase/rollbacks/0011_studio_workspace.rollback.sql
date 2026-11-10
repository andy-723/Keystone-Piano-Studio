-- Rollback 0011 studio workspace. Run in a transaction; staging first.
-- Example rows are deleted; real students and families entered by studios are kept.
-- Restores create_studio_with_owner to its 0005 body (no example student).

delete from public.family where is_example;

create or replace function app_private.create_studio_with_owner(
  p_name text,
  p_timezone text,
  p_owner_user_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_studio_id uuid;
begin
  insert into public.studio (name, timezone, owner_user_id)
  values (p_name, p_timezone, p_owner_user_id)
  returning id into new_studio_id;

  insert into public.studio_member (studio_id, user_id, role)
  values (new_studio_id, p_owner_user_id, 'owner');

  insert into public.platform_audit (actor_user_id, event, target_studio_id, target_user_id, detail)
  values (
    p_actor,
    'studio_created',
    new_studio_id,
    p_owner_user_id,
    jsonb_build_object('name', p_name, 'timezone', p_timezone)
  );

  return new_studio_id;
end;
$$;

drop function if exists app_private.seed_example_student(uuid);
drop trigger if exists studio_is_demo_guard on public.studio;
drop function if exists app_private.guard_studio_is_demo();
alter table public.studio drop constraint if exists studio_profile_object;

alter table public.student drop column if exists grade_goal;
alter table public.student drop column if exists target_term;
alter table public.student drop column if exists exam_date;
alter table public.student drop column if exists is_example;
alter table public.family drop column if exists is_example;
alter table public.family drop column if exists news_photo_consent;
alter table public.family drop column if exists media_consent;
alter table public.studio drop column if exists profile;
alter table public.studio drop column if exists is_demo;

notify pgrst, 'reload schema';
