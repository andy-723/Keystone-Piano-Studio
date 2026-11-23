import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  Check,
  FilePlus2,
  Lock,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatAUD, formatShortDate } from "@/lib/format";
import { studioToday } from "@/lib/studio-clock";
import { TAX_DISCLAIMER } from "@/lib/tax-copy";
import {
  RENEWAL_LABELS,
  defaultBillingTerm,
  defaultClosedDates,
  studioStateFor,
  termDatesProblem,
  termKeyFor,
  upcomingTerms,
  type RenewalStatus,
} from "@/lib/term-billing";
import { studio } from "@/mocks/data";
import { hasFeature } from "@/services/plans";
import {
  liveRenewalQuery,
  liveTermDrafts,
  liveTermHolidays,
  liveTermPreviewQuery,
  prepareLiveTermDrafts,
  sendLiveRenewalInvitations,
  sendLiveRenewalReminders,
  sendLiveTermInvoices,
  setLiveRenewalAnswer,
  type BillingTermInput,
  type TermFamilyRow,
} from "@/services/live/term-billing-store";

const RULE_LABELS = {
  skip: "No lesson and no charge",
  make_up: "No lesson, and a make-up lesson is offered (charged)",
  charge: "Lessons go ahead as normal",
} as const;

const input = "mt-1 block min-h-12 max-w-full rounded-md border border-input bg-card px-3 text-lg";

function BackToInvoices() {
  return (
    <Button asChild variant="ghost">
      <Link to="/invoices">
        <ArrowLeft aria-hidden /> All invoices
      </Link>
    </Button>
  );
}

/** Base plan: what Bill next term does, and how to get it. */
export function ProBillingTeaser({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <BackToInvoices />
      <h1 className="mt-5 flex items-center gap-3 text-3xl font-semibold">
        <Lock aria-hidden className="size-7 text-primary" /> {title}
      </h1>
      <p className="mt-4 text-lg">
        Bill next term and renewal invitations are part of the Pro plan. Keystone counts each
        student's lessons in the term, leaves out public holidays by your studio's rule, and
        prepares one invoice per family for you to check and send.
      </p>
      <p className="mt-3 text-base text-muted-foreground">
        On Base you can still make invoices yourself and copy a family's last invoice from the
        Invoices page.
      </p>
      <Button asChild className="mt-6">
        <Link to="/settings" hash="plan-and-billing">
          Upgrade to Pro
        </Link>
      </Button>
    </div>
  );
}

/** The term being billed or renewed: from the state calendar, with editable dates. */
function useTermChoice() {
  const today = studioToday();
  const state = studioStateFor(studio.state, studio.timezone);
  const terms = useMemo(() => upcomingTerms(state, today), [state, today]);
  const first = defaultBillingTerm(terms, today);
  const [key, setKey] = useState<string>(first?.key ?? "custom");
  const [start, setStart] = useState(first?.start ?? "");
  const [end, setEnd] = useState(first?.end ?? "");
  const [number, setNumber] = useState("1");
  const preset = terms.find((term) => term.key === key);
  const customKey = start ? termKeyFor(Number(start.slice(0, 4)), Number(number)) : "";
  const term: BillingTermInput | null =
    termDatesProblem(start, end) === null
      ? preset
        ? { key: preset.key, name: preset.name, start, end }
        : { key: customKey, name: `Term ${number} ${start.slice(0, 4)}`, start, end }
      : null;
  const choose = (next: string) => {
    setKey(next);
    const found = terms.find((entry) => entry.key === next);
    if (found) {
      setStart(found.start);
      setEnd(found.end);
    }
  };
  const picker = (
    <fieldset className="mt-6 border-y border-border py-5">
      <legend className="sr-only">Term</legend>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-base font-semibold">
          Term
          <select
            aria-label="Term"
            value={key}
            onChange={(event) => choose(event.target.value)}
            className={input}
          >
            {terms.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.name}
              </option>
            ))}
            <option value="custom">Other dates</option>
          </select>
        </label>
        {!preset && (
          <label className="block text-base font-semibold">
            Term number
            <select
              aria-label="Term number"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              className={input}
            >
              {["1", "2", "3", "4"].map((n) => (
                <option key={n} value={n}>
                  Term {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-base">
          First day
          <input
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className={input}
          />
        </label>
        <label className="block text-base">
          Last day
          <input
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className={input}
          />
        </label>
      </div>
      <p className="mt-3 text-base text-muted-foreground">
        {preset
          ? `${state} school term dates. Change them if your studio's term is different.`
          : "Enter your studio's term dates."}
      </p>
      {start && end && termDatesProblem(start, end) && (
        <p className="mt-2 text-base text-destructive">{termDatesProblem(start, end)}</p>
      )}
    </fieldset>
  );
  return { term, picker };
}

function familyState(row: TermFamilyRow, asked: boolean) {
  if (row.invoice?.status === "draft") return { label: "Draft ready", tone: "text-primary" };
  if (row.invoice)
    return {
      label: `Invoice ${row.invoice.number ?? ""} sent`.replace("  ", " "),
      tone: "text-success",
    };
  if (asked && row.renewal !== "confirmed")
    return { label: RENEWAL_LABELS[row.renewal], tone: "text-muted-foreground" };
  if (row.ready) return { label: "Ready to bill", tone: "text-success" };
  return { label: "Nothing to bill", tone: "text-muted-foreground" };
}

export function LiveBillNextTerm() {
  if (!hasFeature("billing_automation", "demo")) return <ProBillingTeaser title="Bill next term" />;
  return <BillNextTerm />;
}

function BillNextTerm() {
  const { term, picker } = useTermChoice();
  return (
    <div className="mx-auto max-w-5xl">
      <BackToInvoices />
      <h1 className="mt-5 text-3xl font-semibold">Bill next term</h1>
      <p className="mt-2 text-lg">
        One invoice per family for the term's lessons. You check the drafts before anything is sent.
      </p>
      {picker}
      {term ? <TermBilling key={`${term.key}-${term.start}-${term.end}`} term={term} /> : null}
      <p className="mt-8 text-base text-muted-foreground">{TAX_DISCLAIMER}</p>
    </div>
  );
}

function TermBilling({ term }: { term: BillingTermInput }) {
  const holidays = useMemo(() => liveTermHolidays(term), [term]);
  const [holidayDates, setHolidayDates] = useState<string[]>(() => defaultClosedDates(holidays));
  const [closures, setClosures] = useState<string[]>([]);
  const [newClosure, setNewClosure] = useState("");
  const [confirming, setConfirming] = useState(false);
  const client = useQueryClient();
  const previewInput = { term, holidayDates, closures };
  const preview = useQuery(liveTermPreviewQuery(previewInput));
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["live-term-billing"] }),
      client.invalidateQueries({ queryKey: ["invoices"] }),
      client.invalidateQueries({ queryKey: ["live-renewals"] }),
    ]);
  const preparing = useMutation({
    mutationFn: () => prepareLiveTermDrafts(previewInput),
    onSuccess: async (drafts) => {
      await refresh();
      toast.success(`${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"} ready to check`);
    },
    onError: (error: Error) =>
      toast.error(error.message || "Drafts could not be prepared. Please try again."),
  });
  const sending = useMutation({
    mutationFn: () => sendLiveTermInvoices(term.key),
    onSuccess: async (sent) => {
      setConfirming(false);
      await refresh();
      toast.success(`${sent.length} ${sent.length === 1 ? "invoice" : "invoices"} sent`);
    },
    onError: async (error: Error) => {
      setConfirming(false);
      await refresh();
      toast.error(error.message || "Some invoices could not be sent. Please try again.");
    },
  });
  const data = preview.data;
  const drafts = data ? liveTermDrafts(term.key) : [];
  const ready = data?.families.filter((row) => row.ready) ?? [];
  const asked = Boolean(data?.campaign);
  const rule = data?.rule ?? studio.policies?.publicHolidays ?? "skip";
  const busy = preparing.isPending || sending.isPending;
  const toggleHoliday = (date: string, on: boolean) =>
    setHolidayDates((current) =>
      on ? [...current, date] : current.filter((entry) => entry !== date),
    );

  return (
    <>
      <section className="mt-6" aria-labelledby="closed-days">
        <h2 id="closed-days" className="text-2xl font-semibold">
          Public holidays and closures
        </h2>
        <p className="mt-2 text-base">
          Your holiday rule: <strong>{RULE_LABELS[rule]}</strong>.{" "}
          <Link to="/settings/terms" className="text-primary underline">
            Change it in studio terms
          </Link>
        </p>
        {holidays.length ? (
          <div className="mt-3 divide-y divide-border border-y border-border">
            {holidays.map((holiday) => (
              <label
                key={holiday.date}
                className="flex min-h-12 cursor-pointer items-center gap-3 py-2 text-base"
              >
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={holidayDates.includes(holiday.date)}
                  onChange={(event) => toggleHoliday(holiday.date, event.target.checked)}
                />
                <span>
                  {formatShortDate(holiday.date)} · {holiday.name}
                  {holiday.regional && (
                    <span className="text-muted-foreground">
                      {" "}
                      · tick if it applies to your area
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-base text-muted-foreground">No public holidays in these dates.</p>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block text-base">
            Studio closed (no lesson, no charge)
            <input
              type="date"
              value={newClosure}
              min={term.start}
              max={term.end}
              onChange={(event) => setNewClosure(event.target.value)}
              className={input}
            />
          </label>
          <Button
            variant="outline"
            disabled={
              !newClosure ||
              newClosure < term.start ||
              newClosure > term.end ||
              closures.includes(newClosure)
            }
            onClick={() => {
              setClosures((current) => [...current, newClosure].sort());
              setNewClosure("");
            }}
          >
            <Plus aria-hidden /> Add closure
          </Button>
        </div>
        {closures.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Studio closures">
            {closures.map((date) => (
              <li key={date}>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setClosures((current) => current.filter((entry) => entry !== date))
                  }
                >
                  {formatShortDate(date)} <X aria-hidden /> <span className="sr-only">Remove</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-border py-5"
        aria-label="Family renewals"
      >
        <div>
          <h2 className="text-xl font-semibold">Renewals</h2>
          <p className="mt-1 text-base text-muted-foreground">
            {asked
              ? `Only families who said they're continuing get an invoice. ${data!.campaign!.responses.filter((r) => r.status === "confirmed").length} continuing · ${data!.campaign!.responses.filter((r) => r.status === "awaiting").length} awaiting reply`
              : "Optional. Ask families if they're continuing first, or bill everyone with lessons in the term."}
          </p>
        </div>
        <Button asChild variant="outline" className="max-w-full whitespace-normal">
          <Link to="/invoices/renewals">
            <MessageCircle aria-hidden /> Renewal invitations
          </Link>
        </Button>
      </section>

      {preview.isPending ? (
        <p className="py-8 text-lg">Counting lessons…</p>
      ) : preview.isError ? (
        <p role="alert" className="py-8 text-lg text-destructive">
          {(preview.error as Error).message || "Lessons could not be counted. Please refresh."}
        </p>
      ) : data && data.families.length === 0 ? (
        <p className="py-8 text-lg">
          No students yet. Enrol students and give them a weekly lesson in the calendar first.
        </p>
      ) : (
        data && (
          <section className="mt-6" aria-labelledby="families-title">
            <h2 id="families-title" className="text-2xl font-semibold">
              Families
            </h2>
            <div className="mt-3 divide-y divide-border border-y border-border">
              {data.families.map((row) => {
                const status = familyState(row, asked);
                return (
                  <article key={row.familyId} aria-label={row.familyName} className="py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h3 className="text-xl font-semibold">{row.familyName}</h3>
                      <span className={`text-base font-semibold ${status.tone}`}>
                        {status.label}
                      </span>
                    </div>
                    {row.students.map((kid) => (
                      <div
                        key={kid.studentId}
                        className="mt-3 grid gap-1 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]"
                      >
                        <div>
                          <p className="text-lg">{kid.name}</p>
                          {kid.problem === "no_lessons" ? (
                            <p className="text-base text-muted-foreground">
                              No weekly lesson in these dates.{" "}
                              <Link to="/calendar" className="text-primary underline">
                                Open calendar
                              </Link>
                            </p>
                          ) : kid.problem === "no_price" ? (
                            <p className="text-base text-destructive">
                              No price for {kid.durationMin} min lessons.{" "}
                              <Link to="/settings" hash="lesson-prices" className="underline">
                                Set lesson prices
                              </Link>
                            </p>
                          ) : (
                            <p className="text-base text-muted-foreground">
                              {kid.lessonName} · {formatAUD(kid.unitCents)} each
                              {kid.skipped.length > 0 &&
                                ` · ${kid.skipped.length} not charged (${kid.skipped.map(formatShortDate).join(", ")})`}
                              {kid.makeUpDates.length > 0 &&
                                ` · make-up offered for ${kid.makeUpDates.map(formatShortDate).join(", ")}`}
                              {kid.cancelled > 0 && ` · ${kid.cancelled} already cancelled`}
                            </p>
                          )}
                          {kid.openCredits > 0 && (
                            <p className="text-base text-muted-foreground">
                              {kid.openCredits} make-up{" "}
                              {kid.openCredits === 1 ? "credit" : "credits"} still to use (not taken
                              off the invoice)
                            </p>
                          )}
                          {kid.dates.length > 0 && (
                            <details className="text-base">
                              <summary className="min-h-12 cursor-pointer py-2 text-primary">
                                Lesson dates
                              </summary>
                              <p className="text-muted-foreground">
                                {kid.dates.map(formatShortDate).join(" · ")}
                              </p>
                            </details>
                          )}
                        </div>
                        <p className="text-lg">
                          {kid.problem ? "—" : `${kid.dates.length} lessons`}
                        </p>
                        <p className="text-lg font-semibold sm:text-right">
                          {kid.problem ? "" : formatAUD(kid.totalCents)}
                        </p>
                      </div>
                    ))}
                    {row.invoice && (
                      <p className="mt-3 text-base">
                        <Link
                          to="/invoices/$invoiceId"
                          params={{ invoiceId: row.invoice.id }}
                          className="text-primary underline"
                        >
                          {row.invoice.status === "draft" ? "Open draft" : "Open invoice"} ·{" "}
                          {formatAUD(row.invoice.totalCents)}
                        </Link>
                      </p>
                    )}
                  </article>
                );
              })}
            </div>

            <footer className="mt-6 space-y-4 border-b border-border pb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-lg">
                  {ready.length} {ready.length === 1 ? "family" : "families"} ready ·{" "}
                  {formatAUD(ready.reduce((sum, row) => sum + row.totalCents, 0))}
                </p>
                <Button disabled={busy || ready.length === 0} onClick={() => preparing.mutate()}>
                  <FilePlus2 aria-hidden /> {preparing.isPending ? "Preparing…" : "Prepare drafts"}
                </Button>
              </div>
              {drafts.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <p className="text-lg">
                    {drafts.length} {drafts.length === 1 ? "draft" : "drafts"} to send ·{" "}
                    {formatAUD(drafts.reduce((sum, invoice) => sum + invoice.totalCents, 0))}. You
                    can edit any draft from Invoices first.
                  </p>
                  {confirming ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={sending.isPending}
                        onClick={() => setConfirming(false)}
                      >
                        Not yet
                      </Button>
                      <Button disabled={sending.isPending} onClick={() => sending.mutate()}>
                        <Send aria-hidden />{" "}
                        {sending.isPending
                          ? "Sending…"
                          : `Email ${drafts.length} ${drafts.length === 1 ? "family" : "families"} now`}
                      </Button>
                    </div>
                  ) : (
                    <Button disabled={busy} onClick={() => setConfirming(true)}>
                      <Send aria-hidden /> Send all
                    </Button>
                  )}
                </div>
              )}
            </footer>
          </section>
        )
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Renewals
// ---------------------------------------------------------------------------

export function LiveRenewals() {
  if (!hasFeature("billing_automation", "demo"))
    return <ProBillingTeaser title="Renewal invitations" />;
  return <Renewals />;
}

function Renewals() {
  const { term, picker } = useTermChoice();
  return (
    <div className="mx-auto max-w-5xl">
      <BackToInvoices />
      <h1 className="mt-5 flex items-center gap-3 text-3xl font-semibold">
        <RefreshCw aria-hidden className="size-7 text-primary" /> Renewal invitations
      </h1>
      <p className="mt-2 text-lg">
        Ask every family if they're continuing next term. Invitations and reminders go to family
        chat, and families answer on Home in the family app.
      </p>
      {picker}
      {term ? <TermRenewals key={term.key} term={term} /> : null}
    </div>
  );
}

const ANSWERS: RenewalStatus[] = ["confirmed", "change_requested", "declined", "awaiting"];

function TermRenewals({ term }: { term: BillingTermInput }) {
  const today = studioToday();
  const campaign = useQuery(liveRenewalQuery(term.key));
  const preview = useQuery(liveTermPreviewQuery({ term, holidayDates: [], closures: [] }));
  const [deadline, setDeadline] = useState(() => {
    const twoWeeksBefore = new Date(Date.parse(`${term.start}T12:00:00Z`) - 14 * 86400000)
      .toISOString()
      .slice(0, 10);
    return twoWeeksBefore > today ? twoWeeksBefore : today;
  });
  const [filter, setFilter] = useState<"all" | RenewalStatus>("all");
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["live-renewals"] }),
      client.invalidateQueries({ queryKey: ["live-term-billing"] }),
      client.invalidateQueries({ queryKey: ["chat-threads"] }),
      client.invalidateQueries({ queryKey: ["messages"] }),
    ]);
  const inviting = useMutation({
    mutationFn: () => sendLiveRenewalInvitations({ term, deadline }),
    onSuccess: async (count) => {
      await refresh();
      toast.success(
        count
          ? `${count} ${count === 1 ? "invitation" : "invitations"} sent to family chat`
          : "Every family has already been asked",
      );
    },
    onError: (error: Error) =>
      toast.error(error.message || "Invitations could not be sent. Please try again."),
  });
  const reminding = useMutation({
    mutationFn: () => sendLiveRenewalReminders(term.key),
    onSuccess: async (count) => {
      await refresh();
      toast.success(
        count
          ? `${count} ${count === 1 ? "reminder" : "reminders"} sent to family chat`
          : "No reminders to send today",
      );
    },
    onError: (error: Error) =>
      toast.error(error.message || "Reminders could not be sent. Please try again."),
  });
  const answering = useMutation({
    mutationFn: (next: { responseId: string; status: RenewalStatus }) => setLiveRenewalAnswer(next),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message || "That answer could not be saved."),
  });
  const data = campaign.data;
  const names = new Map(preview.data?.families.map((row) => [row.familyId, row.familyName]) ?? []);
  const uninvited = (preview.data?.families ?? []).filter(
    (row) => !data?.responses.some((r) => r.familyId === row.familyId),
  );
  const counts = Object.fromEntries(
    (["awaiting", "confirmed", "change_requested", "declined"] as const).map((status) => [
      status,
      data?.responses.filter((r) => r.status === status).length ?? 0,
    ]),
  ) as Record<RenewalStatus, number>;
  const shown = (data?.responses ?? [])
    .filter((r) => filter === "all" || r.status === filter)
    .sort((a, b) => (names.get(a.familyId) ?? "").localeCompare(names.get(b.familyId) ?? ""));
  const busy = inviting.isPending || reminding.isPending;

  if (campaign.isPending) return <p className="py-8 text-lg">Loading renewals…</p>;
  if (campaign.isError)
    return (
      <p role="alert" className="py-8 text-lg text-destructive">
        {(campaign.error as Error).message}
      </p>
    );

  return (
    <>
      <section className="my-6 border-b border-border pb-6" aria-label="Invitations">
        <div className="flex flex-wrap items-end justify-between gap-4">
          {data ? (
            <p className="text-lg">
              Reply by <strong>{formatShortDate(data.deadline)}</strong> · {data.responses.length}{" "}
              {data.responses.length === 1 ? "family" : "families"} asked
            </p>
          ) : (
            <label className="block text-base font-semibold">
              Reply by
              <input
                type="date"
                value={deadline}
                min={today}
                max={term.end}
                onChange={(event) => setDeadline(event.target.value)}
                className={input}
              />
            </label>
          )}
          <Button
            disabled={busy || (Boolean(data) && uninvited.length === 0)}
            onClick={() => inviting.mutate()}
            className="max-w-full whitespace-normal"
          >
            <Send aria-hidden />
            {inviting.isPending
              ? "Sending invitations…"
              : data
                ? uninvited.length
                  ? `Invite ${uninvited.length} new ${uninvited.length === 1 ? "family" : "families"}`
                  : "Every family asked"
                : "Send invitations to families"}
          </Button>
        </div>
        {data && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
            <p className="text-base">{counts.awaiting} awaiting reply</p>
            <Button
              variant="outline"
              disabled={busy || counts.awaiting === 0 || today > data.deadline}
              onClick={() => reminding.mutate()}
            >
              <Bell aria-hidden />{" "}
              {reminding.isPending ? "Sending reminders…" : "Send reminders now"}
            </Button>
          </div>
        )}
      </section>

      {data && (
        <>
          <section
            className="grid grid-cols-2 gap-5 border-b border-border pb-6 md:grid-cols-4"
            aria-label="Renewal totals"
          >
            {(["awaiting", "confirmed", "change_requested", "declined"] as const).map((status) => (
              <div key={status}>
                <p className="text-base text-muted-foreground">{RENEWAL_LABELS[status]}</p>
                <p className="mt-2 font-display text-3xl font-semibold">{counts[status]}</p>
              </div>
            ))}
          </section>
          {counts.confirmed > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-l-4 border-success pl-4">
              <p>
                {counts.confirmed} {counts.confirmed === 1 ? "family" : "families"} continuing
              </p>
              <Button asChild variant="outline" className="max-w-full whitespace-normal">
                <Link to="/invoices/prepare">Bill next term</Link>
              </Button>
            </div>
          )}
          <div className="my-6 flex flex-wrap gap-2" role="group" aria-label="Renewal filter">
            {(["all", "awaiting", "confirmed", "change_requested", "declined"] as const).map(
              (key) => (
                <Button
                  key={key}
                  variant={filter === key ? "secondary" : "ghost"}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {key === "all" ? "All families" : RENEWAL_LABELS[key]}
                </Button>
              ),
            )}
          </div>
          <div className="divide-y divide-border border-y border-border">
            {shown.map((response) => (
              <article
                key={response.id}
                aria-label={names.get(response.familyId) ?? "Family"}
                className="py-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-xl font-semibold">
                    {names.get(response.familyId) ?? "Family"}
                  </h3>
                  <span
                    className={`text-base font-semibold ${response.status === "confirmed" ? "text-success" : response.status === "change_requested" ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {RENEWAL_LABELS[response.status]}
                    {response.respondedBy === "staff" && " (recorded by studio)"}
                  </span>
                </div>
                {response.note && (
                  <p
                    className="mt-2 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-base italic"
                    data-no-translate
                  >
                    {response.note}
                  </p>
                )}
                <p className="mt-2 text-base text-muted-foreground">
                  Invited {formatShortDate(response.invitedAt.slice(0, 10))}
                  {response.remindedAt &&
                    ` · reminded ${formatShortDate(response.remindedAt.slice(0, 10))}`}
                </p>
                <label className="mt-3 block text-base">
                  Record their answer
                  <select
                    aria-label={`Answer for ${names.get(response.familyId) ?? "family"}`}
                    value={response.status}
                    disabled={answering.isPending}
                    onChange={(event) =>
                      answering.mutate({
                        responseId: response.id,
                        status: event.target.value as RenewalStatus,
                      })
                    }
                    className={input}
                  >
                    {ANSWERS.map((status) => (
                      <option key={status} value={status}>
                        {RENEWAL_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </div>
          {shown.length === 0 && (
            <p className="py-8 text-muted-foreground">No families with this answer.</p>
          )}
        </>
      )}
      {!data && (
        <p className="text-base text-muted-foreground">
          <Check aria-hidden className="mr-1 inline size-4" />
          {uninvited.length} {uninvited.length === 1 ? "family" : "families"} will get a message in
          family chat. Their usual chat email alert tells them it's there.
        </p>
      )}
    </>
  );
}
