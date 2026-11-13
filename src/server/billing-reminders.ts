/**
 * Live overdue / pre-due billing reminders for real (non-demo) studios.
 * Cron: /api/cron/billing-reminders. Demo fixtures keep using services/billing-reminders.
 *
 * Skips demo studios and example families. Idempotent via invoice_event unique indexes.
 */
import { getServerEnv, isMockOnboarding } from "./env";
import { getEmailProvider, type EmailProvider } from "./email";
import { createServiceSupabase } from "./supabase";
import { reminderEmail } from "./email/templates/billing";

function emailFromAddress(emailFrom: string) {
  return emailFrom.includes("<")
    ? emailFrom.replace(/^.*<([^>]+)>.*$/, "$1")
    : emailFrom;
}

function studioFromHeader(studioName: string, emailFrom: string) {
  const address = emailFromAddress(emailFrom);
  return `${studioName} <${address}>`;
}

/** Calendar date (YYYY-MM-DD) in a studio timezone. */
export function studioLocalDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type LiveReminderCandidate = {
  studio_id: string;
  studio_name: string;
  studio_timezone: string;
  reply_to_email: string | null;
  family_id: string;
  family_name: string;
  is_example: boolean;
  invoice_id: string;
  invoice_number: string | null;
  due_date: string;
  balance_cents: number;
  status: string;
  bill_to_guardian_id: string | null;
  guardian_email: string | null;
  pre_due_reminder_days: number | null;
  existing_kinds: string[];
};

export interface LiveBillingReminderStore {
  candidates(): Promise<LiveReminderCandidate[]>;
  /** Insert invoice_event; returns false when the unique kind was already recorded. */
  claimEvent(
    studioId: string,
    invoiceId: string,
    kind: string,
    data?: Record<string, unknown>,
  ): Promise<boolean>;
}

export type LiveBillingReminderResult = {
  live: true;
  scanned: number;
  actions: string[];
  sent: number;
  skipped: number;
};

async function supabaseStore(): Promise<LiveBillingReminderStore> {
  const db = createServiceSupabase();

  return {
    async candidates() {
      const { data: invoices, error } = await db
        .from("invoice_with_balance")
        .select(
          "id, studio_id, family_id, number, due_date, balance_cents, status, bill_to_guardian_id, total_cents",
        )
        .not("status", "in", "(draft,paid,void)")
        .gt("balance_cents", 0);
      if (error) throw new Error(`billing reminders: invoices ${error.message}`);
      const rows = invoices ?? [];
      if (rows.length === 0) return [];

      const studioIds = [...new Set(rows.map((row) => row.studio_id as string))];
      const familyIds = [...new Set(rows.map((row) => row.family_id as string))];
      const invoiceIds = rows.map((row) => row.id as string);

      const [
        { data: studios, error: studioError },
        { data: families, error: familyError },
        { data: profiles, error: profileError },
        { data: guardians, error: guardianError },
        { data: events, error: eventError },
      ] = await Promise.all([
        db
          .from("studio")
          .select("id, name, timezone, reply_to_email, is_demo")
          .in("id", studioIds),
        db.from("family").select("id, display_name, is_example").in("id", familyIds),
        db
          .from("studio_billing_profile")
          .select("studio_id, pre_due_reminder_days")
          .in("studio_id", studioIds),
        db
          .from("guardian")
          .select("id, family_id, email")
          .in("family_id", familyIds),
        db
          .from("invoice_event")
          .select("invoice_id, kind")
          .in("invoice_id", invoiceIds),
      ]);
      if (studioError) throw new Error(`billing reminders: studios ${studioError.message}`);
      if (familyError) throw new Error(`billing reminders: families ${familyError.message}`);
      if (profileError) throw new Error(`billing reminders: profiles ${profileError.message}`);
      if (guardianError) throw new Error(`billing reminders: guardians ${guardianError.message}`);
      if (eventError) throw new Error(`billing reminders: events ${eventError.message}`);

      const studioById = new Map((studios ?? []).map((s) => [s.id as string, s]));
      const familyById = new Map((families ?? []).map((f) => [f.id as string, f]));
      const profileByStudio = new Map(
        (profiles ?? []).map((p) => [p.studio_id as string, p]),
      );
      const guardiansByFamily = new Map<string, { id: string; email: string | null }[]>();
      for (const g of guardians ?? []) {
        const list = guardiansByFamily.get(g.family_id as string) ?? [];
        list.push({ id: g.id as string, email: (g.email as string | null) ?? null });
        guardiansByFamily.set(g.family_id as string, list);
      }
      const kindsByInvoice = new Map<string, string[]>();
      for (const event of events ?? []) {
        const list = kindsByInvoice.get(event.invoice_id as string) ?? [];
        list.push(event.kind as string);
        kindsByInvoice.set(event.invoice_id as string, list);
      }

      const out: LiveReminderCandidate[] = [];
      for (const row of rows) {
        const studio = studioById.get(row.studio_id as string);
        if (!studio || studio.is_demo) continue;
        const family = familyById.get(row.family_id as string);
        if (!family) continue;
        const profile = profileByStudio.get(row.studio_id as string);
        const familyGuardians = guardiansByFamily.get(row.family_id as string) ?? [];
        const billTo = row.bill_to_guardian_id
          ? familyGuardians.find((g) => g.id === row.bill_to_guardian_id)
          : undefined;
        const guardian = billTo ?? familyGuardians[0];
        out.push({
          studio_id: row.studio_id as string,
          studio_name: (studio.name as string) || "Studio",
          studio_timezone: (studio.timezone as string) || "Australia/Sydney",
          reply_to_email: (studio.reply_to_email as string | null) ?? null,
          family_id: row.family_id as string,
          family_name: (family.display_name as string) || "Family",
          is_example: Boolean(family.is_example),
          invoice_id: row.id as string,
          invoice_number: (row.number as string | null) ?? null,
          due_date: row.due_date as string,
          balance_cents: Number(row.balance_cents) || 0,
          status: row.status as string,
          bill_to_guardian_id: (row.bill_to_guardian_id as string | null) ?? null,
          guardian_email: guardian?.email ?? null,
          pre_due_reminder_days:
            profile?.pre_due_reminder_days == null
              ? null
              : Number(profile.pre_due_reminder_days),
          existing_kinds: kindsByInvoice.get(row.id as string) ?? [],
        });
      }
      return out;
    },

    async claimEvent(studioId, invoiceId, kind, data) {
      const { error } = await db.from("invoice_event").insert({
        studio_id: studioId,
        invoice_id: invoiceId,
        kind,
        actor: "system",
        ...(data ? { data } : {}),
      });
      if (!error) return true;
      // Unique violation — already claimed.
      if (error.code === "23505") return false;
      throw new Error(`billing reminders: claim ${kind} ${error.message}`);
    },
  };
}

export async function runLiveBillingReminders(options?: {
  store?: LiveBillingReminderStore;
  mail?: EmailProvider;
  now?: Date;
  emailFrom?: string;
}): Promise<LiveBillingReminderResult> {
  if (!options?.store && isMockOnboarding()) {
    return { live: true, scanned: 0, actions: [], sent: 0, skipped: 0 };
  }
  const store = options?.store ?? (await supabaseStore());
  const mail = options?.mail ?? getEmailProvider();
  const emailFrom = options?.emailFrom ?? getServerEnv().emailFrom;
  const now = options?.now ?? new Date();

  const candidates = await store.candidates();
  const actions: string[] = [];
  let sent = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (row.is_example || row.balance_cents <= 0) {
      skipped += 1;
      continue;
    }
    const today = studioLocalDate(now, row.studio_timezone);
    const overdue = row.due_date < today;
    const daysOverdue = overdue ? daysBetween(row.due_date, today) : 0;
    const kinds = new Set(row.existing_kinds);
    const from = studioFromHeader(row.studio_name, emailFrom);
    const replyTo = row.reply_to_email || emailFromAddress(emailFrom);

    if (
      row.pre_due_reminder_days != null &&
      !overdue &&
      row.due_date === addCalendarDays(today, row.pre_due_reminder_days) &&
      !kinds.has("reminder_pre_due")
    ) {
      const claimed = await store.claimEvent(row.studio_id, row.invoice_id, "reminder_pre_due", {
        dueDate: row.due_date,
      });
      if (!claimed) {
        skipped += 1;
      } else {
        if (row.guardian_email) {
          const built = reminderEmail({
            studioName: row.studio_name,
            familyName: row.family_name,
            invoiceNumber: row.invoice_number ?? row.invoice_id,
            totalCents: row.balance_cents,
            dueDate: row.due_date,
            kind: "pre_due",
          });
          await mail.send({
            to: row.guardian_email,
            from,
            replyTo,
            subject: built.subject,
            html: built.html,
            text: built.text,
            tags: [{ name: "kind", value: "reminder_pre_due" }],
          });
          sent += 1;
        }
        actions.push(`pre_due:${row.invoice_id}`);
      }
    }

    if (overdue && !kinds.has("reminder_overdue")) {
      const claimed = await store.claimEvent(row.studio_id, row.invoice_id, "reminder_overdue", {
        daysOverdue,
      });
      if (!claimed) {
        skipped += 1;
      } else {
        if (row.guardian_email) {
          const built = reminderEmail({
            studioName: row.studio_name,
            familyName: row.family_name,
            invoiceNumber: row.invoice_number ?? row.invoice_id,
            totalCents: row.balance_cents,
            dueDate: row.due_date,
            kind: "overdue",
          });
          await mail.send({
            to: row.guardian_email,
            from,
            replyTo,
            subject: built.subject,
            html: built.html,
            text: built.text,
            tags: [{ name: "kind", value: "reminder_overdue" }],
          });
          sent += 1;
        }
        actions.push(`overdue_reminder:${row.invoice_id}`);
      }
    }
  }

  return {
    live: true,
    scanned: candidates.length,
    actions,
    sent,
    skipped,
  };
}
