# Changelog

Studio-facing notes for each release. Add a line under "Unreleased" in every pull request.
When a batch goes out, move the lines under a new version heading (`vYYYY.MM.N`) and publish a
GitHub Release with the same text. See `docs/release-process.md`.

## Unreleased

- Faster: platform admin and support reach `/admin` without waiting on studio/parent mock loaders; sign-in reuse skips a repeat account check after MFA.
- Faster: server code now runs in Sydney next to the database, the first page download is about
  40% smaller, and the admin studio list makes far fewer database round trips.
- Fixed: database access checks for signed-in users failed with "permission denied for schema auth" (migration 0008).
- Fixed: the platform audit log could be edited by server code; it is now append-only (migration 0009).
- Release safety: every pull request is now checked automatically (tests, build, and every
  database change applied to a fresh database) before it can go live.

## v2026.11.0 (10 Nov 2026)

Baseline before the pilot: Art Deco sign-in with MFA, family onboarding, native invoicing,
studio subscription access (0006), onboarding tours.
