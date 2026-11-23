-- Rollback 0026 assignments. Deletes saved practice tasks and their marks for real studios (practice entries stay). Transaction; staging first.
drop trigger if exists practice_log_untick_task on public.practice_log;
drop table if exists public.assignment_task;
drop table if exists public.assignment;
drop function if exists app_private.untick_task_for_practice();
drop function if exists app_private.check_assignment_task();
drop function if exists app_private.check_assignment();
-- Put back the 0018 daily-summary query (course feedback only).
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
revoke all on function public.notify_marking_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.notify_marking_candidates(timestamptz) to service_role;
notify pgrst, 'reload schema';
