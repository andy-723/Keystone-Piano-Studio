## What changes

<!-- One or two sentences a studio owner would understand. -->

## Release checklist

- [ ] CI is green (App checks + Database checks)
- [ ] Tried on the Vercel preview (staging data, never production)
- [ ] No migration, **or** the migration is an expand step that works with the code live now
- [ ] Migration applied to staging, then production, **before** merging
- [ ] Rollback file added for any new migration (`supabase/rollbacks/`)
- [ ] Risky feature is behind a flag, or this is safe to switch on for everyone
- [ ] `CHANGELOG.md` updated under "Unreleased"

## How to undo it

<!-- Vercel Instant Rollback is enough? Or a rollback SQL file, a flag to switch off? -->
