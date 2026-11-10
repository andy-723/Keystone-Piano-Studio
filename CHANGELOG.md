# Changelog

Studio-facing notes for each release. Add a line under "Unreleased" in every pull request.
When a batch goes out, move the lines under a new version heading (`vYYYY.MM.N`) and publish a
GitHub Release with the same text. See `docs/release-process.md`.

## Unreleased

- Release safety: every pull request is now checked automatically (tests, build, and every
  database change applied to a fresh database) before it can go live.

## v2026.11.0 (10 Nov 2026)

Baseline before the pilot: Art Deco sign-in with MFA, family onboarding, native invoicing,
studio subscription access (0006), onboarding tours.
