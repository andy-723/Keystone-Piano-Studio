# Release process

How code and database changes reach production without breaking live studios.
Owner: Andrew (merges to `main`). Applies to every change made by Claude, Cursor or a person.

## Environments

| Environment | Web                                 | Database                                        | Who uses it             |
| ----------- | ----------------------------------- | ----------------------------------------------- | ----------------------- |
| Local / CI  | `bun dev`, GitHub Actions           | Throwaway local Supabase (`supabase start`)     | Developers, CI          |
| Preview     | Vercel preview URL per pull request | **Staging** Supabase project (never production) | Andrew, to try a change |
| Production  | keystonemusichq.com, `main` branch  | Production Supabase (Sydney)                    | Studios and families    |

Preview deployments must never hold production Supabase keys. In Vercel, production keys are set
for the **Production** environment only; staging keys for **Preview**.

## The path of one change

1. Work happens on a branch (`claude/*`, `cursor/*`). Never commit to `main` directly.
2. Open a pull request. CI runs **App checks** (migration rules, unit tests, build) and
   **Database checks** (every migration applied to an empty database, then the pgTAP tenancy and
   subscription tests). Both must pass before merge.
3. Vercel posts a preview URL. Try the change there against staging data.
4. If the PR has a migration, apply it to **staging** first, then to **production before or at
   merge** (see "Database changes"). Code must never go live ahead of the schema it needs.
5. Merge. Vercel builds `main` and swaps it in atomically, so there is no downtime for the swap.
6. Check `/api/health` shows the new commit, then sign in and click through the changed screen.
7. Add a line to `CHANGELOG.md` under "Unreleased" in the same PR (studio-facing wording).

## Database changes: expand, then contract

The database and the code are released separately, so at every moment the live code must work
with the live schema. Split any breaking change into steps:

1. **Expand** (safe any time): add tables, add nullable columns or columns with defaults, add
   functions, add policies that only widen what the current code expects. Old code ignores them.
2. **Release code** that writes both old and new shapes, then reads the new one.
3. **Backfill** existing rows if needed, in batches.
4. **Contract** (a later PR, once step 2 has been live a while): drop or rename the old shape.
   The file must carry a `-- release: contract` line so CI lets it through.

Rules CI enforces (`scripts/check-migrations.mjs`):

- Files are `NNNN_snake_case.sql`, numbered above everything already on `main`.
- A migration already on `main` is never edited, renamed or deleted. Production has run it, so
  fix forward with a new migration.
- From `0007` on, each migration has `supabase/rollbacks/NNNN_name.rollback.sql`.
- Drops, renames and type changes need the `-- release: contract` marker.

Order of operations for a PR with a migration: staging, then production, then merge. Because the
migration is an expand step, applying it before the code ships is safe. This is what went wrong
with PR #22: the code needing 0006 went live first.

## Backups before a migration

- Production runs on Supabase daily backups (7 days on the Pro plan).
- Before any migration that changes or deletes existing rows, take a fresh backup first (dashboard
  backup, or `pg_dump` to encrypted storage in Australia). Never put production data in GitHub,
  CI artifacts or a chat.
- The rollback file is the first resort; restoring a backup is the last, because it loses writes
  made since the backup.

## When a release goes wrong

1. **Roll back the code** in Vercel (Deployments, previous production deploy, Instant Rollback).
   Takes seconds. This only works because migrations are backward compatible (see above).
   After a rollback Vercel stops auto-promoting new `main` builds until you promote one again.
2. If the database is the problem, run the matching rollback file in a transaction, on staging
   first if there is time.
3. Fix forward on a `hotfix/*` branch with a normal PR. CI still runs; there is no skip.
4. If studios were affected, follow the incident plan (MSA incident plan v1.0): log it, tell
   affected studio owners, and assess privacy impact if any data was exposed.

## Feature flags

Risky features ship switched off and are turned on per studio (pilot first). Use a flag, not a
long-lived branch. A flag is removed once the feature is on for everyone.

## Release timing

Studios teach after school and on Saturdays. Normal releases: Monday to Thursday, roughly
10:00 to 14:00 Sydney time, when someone can watch for an hour afterwards. No routine releases on
Friday afternoon or the weekend. Fixes for live breakage go out any time.

## Versioning

`CHANGELOG.md` keeps an "Unreleased" section. When a batch of changes is worth announcing, tag
`main` as `vYYYY.MM.N` (for example `v2026.11.1`) and publish a GitHub Release with the notes.
`/api/health` returns the live commit for checking what is deployed.
