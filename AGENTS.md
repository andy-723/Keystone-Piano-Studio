<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Screens read/write only through async functions in src/services/ (one file per area) over fixtures in src/mocks/ — so the mock layer can be swapped for a REST API later.
- App shell (nav rail / bottom tabs, role switcher, larger-text toggle) lives in src/routes/__root.tsx via AppShell; role switch swaps teacher app for parent portal there.
- Route loaders prime TanStack Query through mock services; attendance optimistically updates the date-keyed cache with rollback so marking is immediate without bypassing the service layer.
- Live lessons are keyed by occurrence ID; the lessons service composes curriculum and chat services, retains notes in mock session state and sends an idempotent family summary. Readiness uses goal-grade passed requirements; practice uses the lesson's Monday–Sunday week and separates student and teacher logs.
