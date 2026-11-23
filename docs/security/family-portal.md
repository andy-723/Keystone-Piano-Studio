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

The browser puts this copy into the stores the parent screens already read
(`src/services/live/family-store.ts`). Each news post is addressed to this family alone.

Tests: `src/test/family-portal.test.ts` (another family's child, private feedback, other
studio, drafts, expired and future posts, archived groups).
