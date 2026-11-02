---
name: Opus brief
description: Full product brief and 6-prompt build order
type: reference
---
Prompt 1 (shell + Today day-book) done. Next: 2 Live Lesson, 3 Chat, 4 Invoices (Term 2 wizard, GST switch), 5 Parent portal (phone, EN/中文, WeChat-safe), 6 Students + Red Risk.

# Opus: Lovable starter prompts

**How to use this**

1. Create a new Lovable project. Paste the **Project knowledge** section into Lovable's project knowledge (or custom instructions) so it applies to every prompt.
2. Paste **Prompt 1** as the first message. Check the result before going further.
3. Send Prompts 2 to 6 one at a time. Lovable does better with one screen per prompt than with everything at once.
4. If Lovable offers to connect Supabase or add authentication, decline. These prototypes use mock data only (decided 2 Nov 2026).

---

## Project knowledge (paste once)

```
PRODUCT
Opus (working name) is a studio management app for independent piano teachers in Australia.
Teachers use it to run their roster, weekly lessons, school-term invoicing, family chat,
student progress against AMEB / Trinity / ABRSM syllabuses, and a "Red Risk" early warning
for students likely to quit. Families use a separate parent portal.

THIS IS A CLICKABLE PROTOTYPE ON MOCK DATA ONLY
- Do NOT connect Supabase, any database, any auth provider or any payment provider.
- Keep all data in src/mocks/ as typed TypeScript fixtures.
- All screens read and write data through a service layer in src/services/ (one file per
  area: roster, schedule, billing, chat, curriculum). Every service function is async and
  returns a Promise, as if it were calling a REST API. Mutations update in-memory state
  so the prototype feels real during a session.
- Fake a logged-in user with a role switcher in the header: "Teacher (Ms Clarke)" and
  "Parent (Wei Chen)". No login screen.

WHO USES IT
- Primary teacher: aged 50 to 70+, accomplished musician, low-to-moderate tech confidence,
  teaches 20 to 45 students a week, used to a paper day planner. Mostly on an iPad.
- Secondary teacher: aged 25 to 45, runs a busier studio, comfortable with software.
- Parents: busy, on phones. Many Chinese-speaking families use WeChat and will open links
  inside WeChat's in-app browser, so the parent portal must work as a plain mobile web page.

DESIGN RULES (non-negotiable)
- Large and calm: base font 18px, touch targets at least 48px, generous spacing.
- One primary action per screen. No hidden swipe actions, no icon-only buttons without labels,
  no nested menus deeper than one level.
- High contrast (WCAG 2.2 AA minimum). Include a "Larger text" toggle in settings.
- The teacher's home screen looks and reads like a paper day-book: today's date at the top,
  lessons listed by time down the page.
- Tablet-first for teachers (iPad landscape and portrait). Phone-first for parents.
- Use the default Lovable stack (React, TypeScript, Tailwind, shadcn/ui). Keep components simple.

AUSTRALIAN CONTEXT
- Locale en-AU: dates as DD/MM/YYYY or "Mon 3 Feb", 12-hour times like "3:30 pm", currency AUD
  shown as "$49.00".
- Lessons follow state school terms (use Victorian 2027 terms in mock data). Public holidays
  are skipped.
- GST: some teachers are GST-registered (charge 10%, invoices titled "Tax invoice", show ABN
  and GST amount), others are not (invoice titled "Invoice", no GST line). Prices for families
  include GST when the teacher is registered: GST = total / 11. Use cents (integers) in data.
- Payments are by PayTo, BECS direct debit or card. Show these as options only; no real payments.

LANGUAGES
- Parent portal: English and Simplified Chinese (简体中文), switchable from a visible toggle.
  Put all strings in src/i18n/en.json and src/i18n/zh-CN.json. Teacher app: English only for now.

MESSAGING
- Communication is in-app chat (like Google Chat), one thread per family. No SMS anywhere.

DATA SHAPES (match these names; the real API will use them)
Studio { id, name, abn?, gstRegistered, timezone: "Australia/Melbourne" }
Teacher { id, name }
Family { id, displayName, guardians: Guardian[] }
Guardian { id, name, email, preferredLanguage: "en" | "zh-CN" }
Student { id, familyId, firstName, lastName, birthYear }
LessonType { id, name, durationMin, priceCents }
LessonOccurrence { id, studentId, startsAt (ISO), endsAt, status: "scheduled" | "attended" |
  "absent" | "cancelled_by_studio" | "cancelled_late" }
Invoice { id, number, familyId, status: "draft" | "sent" | "partially_paid" | "paid" |
  "overdue" | "void", issueDate, dueDate, lines: InvoiceLine[], subtotalCents, taxCents,
  totalCents, isTaxInvoice }
InvoiceLine { description, qty, unitCents, taxCents, lineTotalCents }
Conversation { id, familyId, lastMessageAt, unreadCount }
Message { id, conversationId, authorName, authorRole: "teacher" | "guardian" | "student",
  body, kind: "text" | "voice" | "video" | "image", sentAt, readAt? }
Requirement { id, framework: "AMEB" | "Trinity" | "ABRSM", grade, category: "scales" |
  "pieces" | "aural" | "sight-reading", title }
StudentProgress { studentId, requirementId, status: "not_started" | "learning" | "passed" }
PracticeLog { id, studentId, date, minutes, loggedBy: "student" | "teacher" }
RiskScore { studentId, score (0-100), band: "green" | "yellow" | "red", reasons: string[] }

MOCK DATA
One studio "Clarke Piano Studio" (GST-registered), one teacher, 28 students in 22 families,
a full week of lessons, invoices in every status, 8 chat threads (2 in Chinese), AMEB
requirements for Preliminary to Grade 4 (titles and scale names only, never sheet music),
4 weeks of practice logs, and risk scores with at least 3 red and 5 yellow students.
Use made-up names only.
```

---

## Prompt 1: app shell and the teacher's day-book

```
Build the teacher side of Opus using the project knowledge.

1. App shell: a left navigation rail on tablet (Today, Students, Chat, Invoices, Settings)
   that becomes a bottom tab bar on phones. Header shows studio name, the role switcher,
   and a "Larger text" toggle.
2. Create src/mocks with all fixtures described in the project knowledge, and
   src/services with async functions over them (getTodayLessons, markAttendance,
   getStudents, getStudent, etc.).
3. "Today" screen styled like a paper day-book page: big date heading with previous and next
   day arrows, then each lesson as a large card in time order showing time, student name,
   lesson type, and three large buttons: Attended, Absent, Open lesson. Show a quiet note
   for public holidays and breaks between terms.
4. Marking attendance updates mock state immediately and shows a short confirmation.

Keep it calm and spacious. Nothing smaller than 16px.
```

## Prompt 2: Live Lesson (tablet)

```
Add a "Live Lesson" screen, opened from "Open lesson" on the Today screen. It's used on an
iPad during the lesson.

- Top: student name, grade goal (e.g. "AMEB Grade 3") and a large progress ring
  ("55% ready") calculated from passed requirements.
- Middle: requirements for the goal grade grouped by category (Scales, Pieces, Aural,
  Sight-reading). Each row has three large tap targets: Not started, Learning, Passed.
- A "Practice this week" panel showing minutes logged by the student and a button
  "Add minutes" for the teacher (loggedBy: teacher).
- A notes box for the lesson and a "Record voice note" button (UI only, fake a 10-second clip).
- Bottom: one primary button "Finish and send summary to family", which posts a summary
  message into that family's chat thread in mock state.
```

## Prompt 3: Family chat

```
Build the Chat area, like Google Chat but simpler.

- Left: list of family threads, newest first, with unread badges and a search box.
- Right (or full screen on phone): the thread, with messages grouped by day, the author's
  role shown subtly, and read ticks.
- Composer: text box, attach photo or video, record voice note (fake), send.
- Messages can be text, voice (show a playable waveform placeholder), video (thumbnail
  with duration) or image.
- A lesson summary from Live Lesson appears as a special card in the thread.
- No SMS, no phone numbers anywhere.
```

## Prompt 4: Term invoicing

```
Build Invoices.

- List view with filter chips by status (Draft, Sent, Overdue, Paid) and totals at the top.
- A "Prepare Term 2 invoices" wizard:
  Step 1: shows Term 2 dates and the lessons each student will have after public holidays.
  Step 2: shows one draft invoice per family with lines and totals. GST is shown only
  because this studio is GST-registered: GST = total / 11, titled "Tax invoice", ABN shown.
  Step 3: review and "Send all", which moves them to Sent in mock state.
- Invoice detail page that looks like a clean printable invoice, with a "Mark as paid"
  action and payment method badges (PayTo, Direct debit, Card).
- Add a Settings switch "Registered for GST" so the prototype can show the non-GST version
  (titled "Invoice", no GST line).
```

## Prompt 5: Parent portal (phone, English and Chinese)

```
When the role switcher is set to "Parent (Wei Chen)", show the parent portal instead of
the teacher app. Design it for a phone held in one hand, and make sure it works as a plain
mobile web page (it will be opened inside WeChat's in-app browser).

- Language toggle EN / 中文 at the top, using the i18n files. Default to the guardian's
  preferredLanguage.
- Home: next lesson card, any unpaid invoice with a "Pay now" button (opens a mock payment
  sheet with PayTo, Direct debit, Card), and the latest message from the teacher.
- Chat: the family's thread with the teacher, same features as the teacher side.
- Progress: each child's grade goal, progress ring and requirement list (read only),
  plus "Log practice" where the child or parent adds minutes (loggedBy: student).
- Invoices: list and detail.
Never show Red Risk scores to parents.
```

## Prompt 6: Students and Red Risk

```
Build the Students area for teachers.

- List of students with search, grade goal, and a coloured risk badge (green, yellow, red)
  with the word as well as the colour, so it works for colour-blind users.
- A "Needs attention" filter that shows red and yellow students first, each with their
  reasons (e.g. "Missed 2 weeks in a row", "No practice logged in 14 days",
  "Invoice 21 days overdue").
- Each red student has a "Send a check-in message" button that opens the family chat with
  a friendly, editable template message pre-filled.
- Student profile: details, family and guardians, attendance history, practice chart for
  the last 4 weeks, progress summary, and invoices.
```
