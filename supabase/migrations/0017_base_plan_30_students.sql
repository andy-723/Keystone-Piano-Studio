-- Base plan student cap 35 -> 30 (0017). Andrew, 11 Nov 2026: A$29 Base covers up to 30 students;
-- bigger studios go to Pro. Same function body as 0006 with the new number. Applies to new
-- students only: a Base studio already above 30 keeps everyone and simply cannot add more.
-- Expand only (create or replace; no drops). Keep in step with BASE_STUDENT_CAP in
-- src/lib/subscription.ts.
create or replace function app_private.enforce_plan_student_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_studio uuid;
  current_plan text;
  student_count int;
begin
  target_studio := new.studio_id;
  if target_studio is null then
    select f.studio_id into target_studio from public.family f where f.id = new.family_id;
  end if;

  -- Row lock serialises concurrent inserts for the same studio.
  select s.plan into current_plan
  from public.studio_subscription s
  where s.studio_id = target_studio
  for update;

  if coalesce(current_plan, 'base') = 'base' then
    select count(*) into student_count from public.student st where st.studio_id = target_studio;
    if student_count >= 30 then
      raise exception 'base_plan_student_limit: the Base plan allows up to 30 students'
        using errcode = 'P0001', hint = 'Upgrade to Pro for unlimited students.';
    end if;
  end if;
  return new;
end;
$$;
