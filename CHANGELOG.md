# Changelog

Studio-facing notes for each release. Add a line under "Unreleased" in every pull request.
When a batch goes out, move the lines under a new version heading (`vYYYY.MM.N`) and publish a
GitHub Release with the same text. See `docs/release-process.md`.

## Unreleased

- Student courses and the studio's own Library templates are now saved per studio. A real
  student starts on an empty course instead of demo pieces, and target terms are no longer fixed
  to 2027 (migration 0015).
- Studio news and student groups are now saved per studio, and scheduled posts follow the real
  clock for real studios (migration 0014).
- Family chat is now saved per studio: messages, new family chats and read status survive a
  reload, and families only ever see their own chat (migration 0013).
- Studio tour now follows the order an owner sets up: studio details, terms and privacy, payment details, invoices, enrolling, course templates, news and chat. It ends back on studio details and offers a step-by-step setup guide.
- New studios start clean: each real studio now sees only its own students and families, with
  one example student it can delete. Studio details, studio terms, students and families are
  saved per studio and survive a reload (migration 0011). Chat, news, courses and invoices start
  empty for a real studio and are saved in the next releases. The demo studio keeps the demo data.
- Fixed: studios created in the admin console no longer start read-only ("your studio is
  paused"). The console now asks for starting access (complimentary, pilot or none).
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
