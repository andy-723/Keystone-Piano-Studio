# Access revocation residual windows

Fill measurements after local / staging tests. Do not apply 0003 to production until this table has been reviewed.

Comment in `src/server/members.ts`: existing Realtime channels and issued signed URLs persist until their expiry; the measured window is recorded here.

| Route | What happens on removal | Measured residual window | Date tested | Tester |
| --- | --- | --- | --- | --- |
| Database queries (RLS) | Membership row deleted; subsequent authenticated queries return zero rows for that studio | | | |
| Realtime private channels | Existing channel subscriptions may keep delivering until reconnect / JWT refresh | | | |
| Signed Storage URLs | Issued signed URLs remain valid until their TTL expires | | | |
| Access tokens | Admin `signOut(..., "global")` invalidates refresh tokens; access token may work until natural expiry | | | |
| Queued notifications | Pending studio notifications for the user are cancelled (enqueued cancellation) | | | |
| Email links | Invite / magic links already issued still verify by token hash until expiry or revoke | | | |
