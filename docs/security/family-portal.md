# Family portal on real studios

Parents of a real studio see their children's lessons, studio news and course progress in the
family portal. Parents have no database read on `news_post`, `student_course` or the studio
calendar through RLS (0010 allows lesson reads, 0014 and 0015 are staff only), so the content
comes from one server function, `familyPortalFn` in `src/server/family-portal.ts`.

## What the server checks

1. The access token is verified (`verifyAccessToken`). Nothing in the request picks the family.
2. The family comes from the signed-in user's own `guardian` row (`guardian.user_id`). A revoked
   parent has no `user_id` (0020), so they get nothing.
3. The studio must have full access (0006). Service-key reads skip the RLS access gate, so this
   is checked in code; a paused studio is read-only for its owner only.
4. Every query is scoped by that studio id and the family's own student ids.

## What goes back (family-safe copy)

| Content | Rule (`src/lib/family-portal.ts`) |
| --- | --- |
| Lessons | Next 28 days from today in the studio's timezone, the family's children only, cancelled and moved weeks included. No teacher id, location or note. |
| News | Published (or scheduled and due), not expired, for the whole studio, the family by id, or a manual group with one of the children in it. Group posts saved since 23 Nov 2026 also carry the families they reached (smart groups exist only in the app). Title, body, tag, dates, important and author name only; no author id, audience or attachments. |
| Courses | Active course per child. Feedback only where the teacher marked it shared; private feedback and its comment stay on the server. |
| Practice (0023) | The children's practice for the last 8 weeks (date, minutes, home or lesson). No user ids. |
| Practice tasks (0026) | Assignments for the children due from 14 days ago: due date, tasks (text, minutes, days, https attachment link), tick, teacher's mark and shared comment. No course item ids or who marked it. |
| Notes (0023) | Only `client_note` rows with `visibility = 'shared'`, about one of the children or the family. The query filters on shared and `familySharedNotes` filters again, so a private note never leaves the server. |

## Parents logging practice (0023)

`familyLogPracticeFn` does the same checks (verified token, own guardian row) and then requires
full access (`canWrite`, a paused studio takes no new rows). The child must be one of the
family's own students, the date no later than today in the studio's timezone and no more than
30 days back, and 1 to 600 minutes. It inserts `logged_by = 'parent'` with the parent's user id.
Parents have no RLS grant on `practice_log` or `client_note`; staff read and write both under RLS
(owner, admin, teacher), with the 0006 access gate. Triggers keep each row inside its own studio,
stop a note moving to another student or family, and delete notes when their student or family
is deleted.

## Parents ticking tasks and deleting practice (0026)

`src/server/family-assignments.ts`, same identity and `canWrite` checks. `familyCompleteTaskFn`
loads the task by id inside the family's studio, refuses it unless its assignment is for one of
the family's own children, logs today's practice (`logged_by = 'parent'`, 1 to 600 minutes) and
ticks the task only while it is unticked, so a double tap never logs twice.
`familyDeletePracticeFn` deletes one practice entry only if it is for one of the family's
children, was logged by a parent or student (never the teacher's minutes) and is from the last
30 days. A `before delete` trigger on `practice_log` un-ticks the task that entry ticked.
Parents have no grant on `assignment` or `assignment_task`; staff use RLS (owner, admin,
teacher) with the 0006 access gate, and triggers keep tasks inside their assignment's studio.

The browser puts this copy into the stores the parent screens already read
(`src/services/live/family-store.ts`). Each news post is addressed to this family alone.

Tests: `src/test/family-portal.test.ts` (another family's child, private feedback and notes,
other studio, drafts, expired and future posts, archived groups, practice date and minute rules)
and `supabase/tests/practice-notes.test.sql` (guardians read nothing, other studios can't read or
write, cross-studio subjects refused, paused studio can't write). Practice tasks:
`src/test/assignments-live.test.ts` and `supabase/tests/assignments.test.sql`.
