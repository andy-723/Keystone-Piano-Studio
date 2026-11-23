/**
 * Bill next term and term renewals for real studios (0027, 23 Nov 2026). Pro only.
 * Staff read the calendar (0010), make-up credits (0025) and renewals (0027) under RLS with
 * their own session. Term drafts are ordinary draft invoices (invoice.term_key) created and sent
 * through the billing services, so they save, number and email like any other invoice.
 * Families never call this: they answer renewals through src/server/family-renewals.ts.
 */
import { queryOptions } from "@tanstack/react-query";
import { liveStudioId, liveUserId } from "@/lib/studio-workspace";
import { studioToday } from "@/lib/studio-clock";
import {
  creditBalance,
  creditLots,
  type CreditEntry,
  type CreditReason,
} from "@/lib/makeup-credits";
import type { LessonException, LessonSeries } from "@/lib/lesson-calendar";
import {
  holidaysInTerm,
  priceFor,
  renewalChatBody,
  renewalDeadlineProblem,
  studioStateFor,
  termDatesProblem,
  termDueDate,
  termLessons,
  termLineDescription,
  type Holiday,
  type RenewalStatus,
} from "@/lib/term-billing";
import { families, invoices, lessonTypes, students, studio, teacher } from "@/mocks/data";
import type { Invoice, InvoiceLine } from "@/mocks/types";
import { createInvoice, sendInvoices } from "../billing";
import { getOrCreateFamilyConversation, sendMessage } from "../chat";
import { hasFeature } from "../plans";
import { client, friendly } from "./client";

const PRO_MESSAGE = "Bill next term is part of the Pro plan.";

function studioId() {
  const id = liveStudioId();
  if (!id) throw new Error("Bill next term is saved for real studios only.");
  return id;
}

function requirePro() {
  if (!hasFeature("billing_automation", "demo")) throw new Error(PRO_MESSAGE);
}

const missing = (error: { code?: string } | null) =>
  Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));

export type BillingTermInput = { key: string; name: string; start: string; end: string };

export type TermPreviewInput = {
  term: BillingTermInput;
  /** Ticked public holidays (follow the studio's holiday rule). */
  holidayDates: string[];
  /** The studio's own closures (never charged). */
  closures: string[];
};

export type TermStudentRow = {
  studentId: string;
  name: string;
  familyId: string;
  dates: string[];
  skipped: string[];
  makeUpDates: string[];
  cancelled: number;
  durationMin: number | null;
  lessonName: string | null;
  unitCents: number;
  totalCents: number;
  /** Why this student can't be billed yet, if they can't. */
  problem: "no_lessons" | "no_price" | null;
  openCredits: number;
};

export type TermFamilyRow = {
  familyId: string;
  familyName: string;
  students: TermStudentRow[];
  totalCents: number;
  renewal: RenewalStatus | "not_invited";
  /** The family's invoice for this term, if one exists (draft or sent). */
  invoice: {
    id: string;
    status: Invoice["status"];
    number: string | null;
    totalCents: number;
  } | null;
  /** Ready to get a new draft: has billable lessons, no invoice yet, and confirmed if asked. */
  ready: boolean;
};

export type TermPreview = {
  term: BillingTermInput;
  rule: "skip" | "make_up" | "charge";
  families: TermFamilyRow[];
  campaign: LiveRenewalCampaign | null;
};

type SeriesRow = {
  id: string;
  student_id: string;
  teacher_user_id: string;
  repeat: "weekly" | "once";
  first_date: string;
  until_date: string | null;
  start_time: string;
  duration_min: number;
};
type ExceptionRow = {
  id: string;
  series_id: string;
  original_date: string;
  action: "cancel" | "move";
  new_date: string | null;
  new_start_time: string | null;
};
type CreditRow = {
  id: string;
  student_id: string;
  amount: 1 | 0 | -1;
  reason: CreditReason;
  occurrence_key: string | null;
  applies_to: string | null;
  makeup_series_id: string | null;
  expires_on: string | null;
  created_at: string;
};

async function loadCalendar(term: { start: string; end: string }) {
  const id = studioId();
  const c = client();
  const [seriesRes, exceptionRes, creditRes] = await Promise.all([
    c
      .from("lesson_series")
      .select(
        "id, student_id, teacher_user_id, repeat, first_date, until_date, start_time, duration_min",
      )
      .eq("studio_id", id)
      .eq("repeat", "weekly")
      .lte("first_date", term.end)
      .or(`until_date.is.null,until_date.gte.${term.start}`),
    c
      .from("lesson_exception")
      .select("id, series_id, original_date, action, new_date, new_start_time")
      .eq("studio_id", id)
      .gte("original_date", term.start)
      .lte("original_date", term.end),
    c
      .from("makeup_credit")
      .select(
        "id, student_id, amount, reason, occurrence_key, applies_to, makeup_series_id, expires_on, created_at",
      )
      .eq("studio_id", id),
  ]);
  if (seriesRes.error && !missing(seriesRes.error))
    throw friendly(seriesRes.error, "Couldn't load your lesson calendar. Please try again.");
  if (exceptionRes.error && !missing(exceptionRes.error))
    throw friendly(exceptionRes.error, "Couldn't load your lesson calendar. Please try again.");
  const series: LessonSeries[] = ((seriesRes.data ?? []) as SeriesRow[]).map((row) => ({
    id: row.id,
    studioId: id,
    studentId: row.student_id,
    teacherUserId: row.teacher_user_id,
    repeat: row.repeat,
    firstDate: row.first_date,
    untilDate: row.until_date,
    startTime: row.start_time.slice(0, 5),
    durationMin: row.duration_min,
    location: null,
    note: null,
    googleSyncStatus: "off",
    googleSyncError: null,
  }));
  const exceptions: LessonException[] = ((exceptionRes.data ?? []) as ExceptionRow[]).map(
    (row) => ({
      id: row.id,
      studioId: id,
      seriesId: row.series_id,
      originalDate: row.original_date,
      action: row.action,
      newDate: row.new_date,
      newStartTime: row.new_start_time ? row.new_start_time.slice(0, 5) : null,
    }),
  );
  // A database without 0025 yet just shows no credits.
  const credits: CreditEntry[] = creditRes.error
    ? []
    : ((creditRes.data ?? []) as CreditRow[]).map((row) => ({
        id: row.id,
        studioId: id,
        studentId: row.student_id,
        amount: row.amount,
        reason: row.reason,
        occurrenceKey: row.occurrence_key,
        appliesTo: row.applies_to,
        makeupSeriesId: row.makeup_series_id,
        expiresOn: row.expires_on,
        createdAt: row.created_at,
      }));
  return { series, exceptions, credits };
}

/** The studio's state and the public holidays inside a term. */
export function liveTermHolidays(term: { start: string; end: string }): Holiday[] {
  return holidaysInTerm(studioStateFor(studio.state, studio.timezone), term.start, term.end);
}

function termInvoiceFor(familyId: string, termKey: string) {
  return (
    invoices.find(
      (invoice) =>
        invoice.familyId === familyId && invoice.termKey === termKey && invoice.status !== "void",
    ) ?? null
  );
}

/** Everything the Bill next term screen shows for one term. */
export async function previewLiveTerm(input: TermPreviewInput): Promise<TermPreview> {
  const problem = termDatesProblem(input.term.start, input.term.end);
  if (problem) throw new Error(problem);
  const [{ series, exceptions, credits }, campaign] = await Promise.all([
    loadCalendar(input.term),
    getLiveRenewalCampaign(input.term.key),
  ]);
  const rule = studio.policies?.publicHolidays ?? "skip";
  const lessons = termLessons(
    series,
    exceptions,
    input.term,
    input.holidayDates,
    rule,
    input.closures,
  );
  const today = studioToday();
  const lots = creditLots(credits, today);
  const answers = new Map(campaign?.responses.map((r) => [r.familyId, r.status]) ?? []);

  const rows: TermFamilyRow[] = families
    .filter((family) => !family.isExample)
    .map((family): TermFamilyRow => {
      const kids = students
        .filter((student) => student.familyId === family.id && !student.isExample)
        .map((student): TermStudentRow => {
          const counted = lessons.get(student.id);
          const type = priceFor(lessonTypes, counted?.durationMin ?? null);
          const dates = counted?.dates ?? [];
          const unitCents = type?.priceCents ?? 0;
          return {
            studentId: student.id,
            name: `${student.firstName} ${student.lastName}`.trim(),
            familyId: family.id,
            dates,
            skipped: counted?.skipped ?? [],
            makeUpDates: counted?.makeUpDates ?? [],
            cancelled: counted?.cancelled ?? 0,
            durationMin: counted?.durationMin ?? null,
            lessonName: type?.name ?? null,
            unitCents,
            totalCents: type ? unitCents * dates.length : 0,
            problem: !dates.length ? "no_lessons" : type ? null : "no_price",
            openCredits: creditBalance(lots.filter((lot) => lot.studentId === student.id)),
          };
        });
      const invoice = termInvoiceFor(family.id, input.term.key);
      const renewal: RenewalStatus | "not_invited" = answers.get(family.id) ?? "not_invited";
      const billable = kids.filter((kid) => !kid.problem);
      return {
        familyId: family.id,
        familyName: family.displayName,
        students: kids,
        totalCents: billable.reduce((sum, kid) => sum + kid.totalCents, 0),
        renewal,
        invoice: invoice
          ? {
              id: invoice.id,
              status: invoice.status,
              number: invoice.number,
              totalCents: invoice.totalCents,
            }
          : null,
        ready: billable.length > 0 && !invoice && (!campaign || renewal === "confirmed"),
      };
    })
    .filter((row) => row.students.length > 0)
    .sort((a, b) => a.familyName.localeCompare(b.familyName));
  return { term: input.term, rule, families: rows, campaign };
}

export const liveTermPreviewQuery = (input: TermPreviewInput) =>
  queryOptions({
    queryKey: [
      "live-term-billing",
      input.term.key,
      input.term.start,
      input.term.end,
      input.holidayDates,
      input.closures,
    ],
    queryFn: () => previewLiveTerm(input),
  });

/**
 * Makes one draft invoice per ready family (a family already holding an invoice for this term
 * gets nothing new, so preparing twice adds nothing). Returns the term's drafts.
 */
export async function prepareLiveTermDrafts(input: TermPreviewInput): Promise<Invoice[]> {
  requirePro();
  const preview = await previewLiveTerm(input);
  const today = studioToday();
  for (const family of preview.families) {
    if (!family.ready) continue;
    const lines: InvoiceLine[] = family.students
      .filter((kid) => !kid.problem)
      .map((kid) => ({
        description: termLineDescription(
          kid.name,
          kid.lessonName ?? "Lesson",
          input.term.name,
          kid.makeUpDates,
        ),
        qty: kid.dates.length,
        unitCents: kid.unitCents,
        lineTotalCents: kid.totalCents,
        taxCents: 0,
        taxCode: "taxable",
        studentId: kid.studentId,
      }));
    // Re-check just before saving, in case another tab made it meanwhile.
    if (termInvoiceFor(family.familyId, input.term.key)) continue;
    await createInvoice({
      familyId: family.familyId,
      lines,
      issueDate: today,
      dueDate: termDueDate(input.term.start, today),
      billingPeriod: { start: input.term.start, end: input.term.end },
      termKey: input.term.key,
    });
  }
  return liveTermDrafts(input.term.key);
}

/** This term's unsent drafts. */
export function liveTermDrafts(termKey: string): Invoice[] {
  return invoices.filter((invoice) => invoice.termKey === termKey && invoice.status === "draft");
}

/** Numbers and emails every draft for the term (each family gets its own email). */
export async function sendLiveTermInvoices(termKey: string): Promise<Invoice[]> {
  requirePro();
  const ids = liveTermDrafts(termKey).map((invoice) => invoice.id);
  if (!ids.length) return [];
  return sendInvoices(ids);
}

// ---------------------------------------------------------------------------
// Renewals
// ---------------------------------------------------------------------------

export type LiveRenewalResponse = {
  id: string;
  familyId: string;
  status: RenewalStatus;
  invitedAt: string;
  remindedAt: string | null;
  respondedAt: string | null;
  respondedBy: "family" | "staff" | null;
  note: string | null;
};

export type LiveRenewalCampaign = {
  id: string;
  termKey: string;
  termStart: string;
  termEnd: string;
  deadline: string;
  responses: LiveRenewalResponse[];
};

type CampaignRow = {
  id: string;
  term_key: string;
  term_start: string;
  term_end: string;
  deadline: string;
  renewal_response: Array<{
    id: string;
    family_id: string;
    status: RenewalStatus;
    invited_at: string;
    reminded_at: string | null;
    responded_at: string | null;
    responded_by: "family" | "staff" | null;
    note: string | null;
  }>;
};

const CAMPAIGN_SELECT =
  "id, term_key, term_start, term_end, deadline, renewal_response(id, family_id, status, invited_at, reminded_at, responded_at, responded_by, note)";

function toCampaign(row: CampaignRow): LiveRenewalCampaign {
  return {
    id: row.id,
    termKey: row.term_key,
    termStart: row.term_start,
    termEnd: row.term_end,
    deadline: row.deadline,
    responses: (row.renewal_response ?? []).map((r) => ({
      id: r.id,
      familyId: r.family_id,
      status: r.status,
      invitedAt: r.invited_at,
      remindedAt: r.reminded_at,
      respondedAt: r.responded_at,
      respondedBy: r.responded_by,
      note: r.note,
    })),
  };
}

/** The term's renewal campaign, or null when invitations haven't gone out (or no 0027 yet). */
export async function getLiveRenewalCampaign(termKey: string): Promise<LiveRenewalCampaign | null> {
  const { data, error } = await client()
    .from("renewal_campaign")
    .select(CAMPAIGN_SELECT)
    .eq("studio_id", studioId())
    .eq("term_key", termKey)
    .maybeSingle();
  if (error) {
    if (missing(error)) return null;
    throw friendly(error, "Couldn't load renewals. Please try again.");
  }
  return data ? toCampaign(data as CampaignRow) : null;
}

export const liveRenewalQuery = (termKey: string) =>
  queryOptions({
    queryKey: ["live-renewals", termKey],
    queryFn: () => getLiveRenewalCampaign(termKey),
  });

async function postToFamily(familyId: string, body: string) {
  const conversation = await getOrCreateFamilyConversation(familyId);
  await sendMessage({
    conversationId: conversation.id,
    authorName: teacher.name || studio.name,
    authorRole: "teacher",
    body,
    kind: "text",
  });
}

/** Families who can be asked: real families with at least one student. */
function invitableFamilies() {
  return families.filter(
    (family) =>
      !family.isExample &&
      students.some((student) => student.familyId === family.id && !student.isExample),
  );
}

/**
 * Sends renewal invitations to every family not yet asked for this term (one family chat
 * message each). The first call saves the term and reply-by date; later calls invite families
 * added since, with the same date.
 */
export async function sendLiveRenewalInvitations(input: {
  term: BillingTermInput;
  deadline: string;
}): Promise<number> {
  requirePro();
  const id = studioId();
  const dates = termDatesProblem(input.term.start, input.term.end);
  if (dates) throw new Error(dates);
  let campaign = await getLiveRenewalCampaign(input.term.key);
  if (!campaign) {
    const problem = renewalDeadlineProblem(input.deadline, studioToday(), input.term.end);
    if (problem) throw new Error(problem);
    const { error } = await client().from("renewal_campaign").insert({
      studio_id: id,
      term_key: input.term.key,
      term_start: input.term.start,
      term_end: input.term.end,
      deadline: input.deadline,
      created_by: liveUserId(),
    });
    if (error && error.code !== "23505") {
      if (missing(error))
        throw new Error("Renewals need a database update first. Contact Keystone support.");
      throw friendly(error, "Couldn't save the renewal. Please try again.");
    }
    campaign = await getLiveRenewalCampaign(input.term.key);
    if (!campaign) throw new Error("Couldn't save the renewal. Please try again.");
  }
  const asked = new Set(campaign.responses.map((r) => r.familyId));
  const fresh = invitableFamilies().filter((family) => !asked.has(family.id));
  let count = 0;
  for (const family of fresh) {
    const { error } = await client()
      .from("renewal_response")
      .insert({ studio_id: id, campaign_id: campaign.id, family_id: family.id });
    // Another tab invited this family first: don't message them twice.
    if (error?.code === "23505") continue;
    if (error) throw friendly(error, "Couldn't save the renewal. Please try again.");
    await postToFamily(
      family.id,
      renewalChatBody("invite", termNameFor(campaign), campaign.deadline),
    );
    count++;
  }
  return count;
}

function termNameFor(campaign: { termKey: string }) {
  const [year, n] = campaign.termKey.split("-T");
  return `Term ${n} ${year}`;
}

/** Reminds families who haven't answered (once a day at most). */
export async function sendLiveRenewalReminders(termKey: string): Promise<number> {
  requirePro();
  const campaign = await getLiveRenewalCampaign(termKey);
  if (!campaign) return 0;
  const today = studioToday();
  if (today > campaign.deadline) throw new Error("The reply-by date has passed.");
  let count = 0;
  for (const response of campaign.responses) {
    if (response.status !== "awaiting") continue;
    if (response.remindedAt && response.remindedAt.slice(0, 10) >= today) continue;
    const now = new Date().toISOString();
    const { data, error } = await client()
      .from("renewal_response")
      .update({ reminded_at: now })
      .eq("id", response.id)
      .eq("studio_id", studioId())
      .eq("status", "awaiting")
      .select("id");
    if (error) throw friendly(error, "Couldn't send reminders. Please try again.");
    if (!(data ?? []).length) continue;
    await postToFamily(
      response.familyId,
      renewalChatBody("reminder", termNameFor(campaign), campaign.deadline),
    );
    count++;
  }
  return count;
}

/** The teacher records a family's answer (for example after a phone call), or resets it. */
export async function setLiveRenewalAnswer(input: {
  responseId: string;
  status: RenewalStatus;
  note?: string;
}): Promise<void> {
  requirePro();
  const note = input.note?.trim() || null;
  if (note && note.length > 1000) throw new Error("Keep the note under 1000 characters.");
  const answered = input.status !== "awaiting";
  const { error } = await client()
    .from("renewal_response")
    .update({
      status: input.status,
      responded_at: answered ? new Date().toISOString() : null,
      responded_by: answered ? "staff" : null,
      responded_by_user: answered ? liveUserId() : null,
      ...(note !== null || !answered ? { note } : {}),
    })
    .eq("id", input.responseId)
    .eq("studio_id", studioId());
  if (error) throw friendly(error, "Couldn't save this answer. Please try again.");
}
