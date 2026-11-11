import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  Download,
  RefreshCw,
  Send,
  Landmark,
  Wallet,
  AlertTriangle,
  Scale,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatAUD, formatNumericDate } from "@/lib/format";
import { proCfoPackQuery } from "@/lib/pro-cfo-queries";
import {
  pushTeacherBillsToXero,
  retryXeroQueueItem,
  sendOverdueChase,
  teacherRemittanceCsv,
  type ProCfoPack,
} from "@/services/pro-cfo";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const panel =
  "rounded-[2px] border border-[#D9C79E] bg-[#FBF7EE] px-4 py-5 md:px-6 md:py-6";
const card =
  "rounded-[2px] border border-[#D9C79E] bg-[#F5EBD6] px-4 py-4";
const muted = "text-base text-[#5A4F43]";
const title = "font-display text-2xl font-semibold text-[#15100D]";

function PulseTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <li className={card}>
      <p className="text-base font-semibold text-[#604A19]">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-[#15100D]">{value}</p>
      <p className={`mt-1 ${muted}`}>{hint}</p>
    </li>
  );
}

function GstBar({ pack }: { pack: ProCfoPack }) {
  const { gstRadar } = pack;
  const width = Math.min(100, Math.max(2, gstRadar.percentOfThreshold));
  return (
    <div className={card} aria-label="GST radar">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-[#604A19]">GST radar</p>
          <p className="mt-1 font-display text-2xl font-semibold text-[#15100D]">
            {formatAUD(gstRadar.rolling12mTurnoverCents)}
            <span className={`ml-2 text-lg font-normal ${muted}`}>
              / {formatAUD(gstRadar.thresholdCents)}
            </span>
          </p>
        </div>
        <p className={muted}>
          {gstRadar.percentOfThreshold}% of $75k
          {gstRadar.softPreview ? " · Pro preview" : ""}
        </p>
      </div>
      <div
        className="mt-4 h-3 w-full overflow-hidden rounded-[2px] bg-[#E6D7B8]"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(gstRadar.percentOfThreshold))}
        aria-label="Rolling 12-month turnover versus $75,000 GST threshold"
      >
        <div
          className={`h-full ${gstRadar.overThreshold ? "bg-[#8B3A2A]" : "bg-[#604A19]"}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className={`mt-3 ${muted}`}>
        {gstRadar.overThreshold
          ? "Rolling turnover is at or above the $75k GST registration line — keep Xero tax codes tidy for BAS."
          : "Informational only. Starter studios can watch this bar; Pro keeps the live BAS estimate beside Xero health."}
      </p>
    </div>
  );
}

export function ProCfoPanel() {
  const { data: pack } = useSuspenseQuery(proCfoPackQuery());
  const client = useQueryClient();

  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["pro-cfo"] });
  };

  const retry = useMutation({
    mutationFn: (invoiceId: string) => retryXeroQueueItem(invoiceId),
    onSuccess: async (result) => {
      await invalidate();
      if (result.ok) toast.success("Pushed to Xero");
      else toast.error("Retry failed — try again");
    },
    onError: (error: Error) => toast.error(error.message || "Could not retry Xero sync."),
  });

  const remittancePush = useMutation({
    mutationFn: () => pushTeacherBillsToXero(),
    onSuccess: async (result) => {
      await invalidate();
      toast.success(`Pushed ${result.pushed} contractor bill${result.pushed === 1 ? "" : "s"} to Xero (mock)`);
    },
    onError: (error: Error) => toast.error(error.message || "Could not push bills."),
  });

  const chase = useMutation({
    mutationFn: (invoiceId: string) => sendOverdueChase(invoiceId),
    onSuccess: async () => {
      await Promise.all([
        invalidate(),
        client.invalidateQueries({ queryKey: ["chat-threads"] }),
        client.invalidateQueries({ queryKey: ["messages"] }),
      ]);
      toast.success("Overdue reminder sent in family chat");
    },
    onError: (error: Error) => toast.error(error.message || "Could not send reminder."),
  });

  const failedOrPending = pack.xeroQueue.filter((row) => row.status !== "synced");

  return (
    <section className="mt-10" data-tour="pro-cfo" aria-label="Pro CFO">
      <header className={`${panel} mb-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold uppercase tracking-[0.14em] text-[#604A19]">
              Pro CFO
            </p>
            <h2 className={`mt-2 ${title}`}>Cash, margin and Xero ops</h2>
            <p className={`mt-2 max-w-2xl ${muted}`}>
              Rolling {formatNumericDate(pack.windowStart)}–{formatNumericDate(pack.windowEnd)}{" "}
              pulse for owners — not a second ledger.{" "}
              {pack.proEnabled
                ? "Pro tools are unlocked on this studio."
                : "Soft Pro preview — upgrade unlocks Xero retry and remittance push."}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-[2px] border px-3 py-2 text-base font-semibold ${
              pack.xeroHealth.connected
                ? "border-[#C2A259] bg-[#F5EBD6] text-[#604A19]"
                : "border-[#D9C79E] bg-[#F5EBD6] text-[#5A4F43]"
            }`}
          >
            <BadgeCheck className="size-5" aria-hidden />
            {pack.xeroHealth.label}
          </span>
        </div>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="CFO pulse ribbon">
        <PulseTile
          label="Net cash collected"
          value={formatAUD(pack.pulse.netCashCents)}
          hint={`${formatAUD(pack.pulse.grossCollectedCents)} gross · ${formatAUD(pack.pulse.stripeFeesCents)} Stripe fees`}
        />
        <PulseTile
          label={pack.pulse.marginMode === "multi_teacher" ? "Studio margin" : "Solo net"}
          value={formatAUD(pack.pulse.studioMarginCents)}
          hint={
            pack.pulse.marginMode === "multi_teacher"
              ? `After ${formatAUD(pack.pulse.teacherPayoutCents)} teacher splits`
              : `After ${formatAUD(pack.pulse.taxLiteExpenseCents)} Tax Lite expenses`
          }
        />
        <PulseTile
          label="Unearned tuition"
          value={formatAUD(pack.pulse.unearnedTuitionCents)}
          hint={`${pack.pulse.unearnedLessonCount} prepaid lesson${pack.pulse.unearnedLessonCount === 1 ? "" : "s"} not yet delivered`}
        />
        <PulseTile
          label="Xero + GST"
          value={pack.xeroHealth.gstRegistered ? "GST on" : "GST off"}
          hint={`Collected ${formatAUD(pack.xeroHealth.gstCollectedCents)} · credits ${formatAUD(pack.xeroHealth.gstCreditsCents)} · BAS est. ${formatAUD(pack.xeroHealth.basEstimateCents)}`}
        />
      </ul>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className={panel} aria-label="Revenue and churn">
          <div className="flex items-center gap-2 text-[#604A19]">
            <Scale className="size-5" aria-hidden />
            <h3 className={title}>Revenue and churn</h3>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={card}>
              <dt className="font-semibold text-[#604A19]">Earned</dt>
              <dd className="mt-1 font-display text-xl font-semibold text-[#15100D]">
                {formatAUD(pack.revenueChurn.earnedCents)}
              </dd>
              <dd className={muted}>
                {pack.revenueChurn.earnedLessonCount} lessons delivered
              </dd>
            </div>
            <div className={card}>
              <dt className="font-semibold text-[#604A19]">Collected</dt>
              <dd className="mt-1 font-display text-xl font-semibold text-[#15100D]">
                {formatAUD(pack.revenueChurn.collectedCents)}
              </dd>
              <dd className={muted}>Cash taken in window</dd>
            </div>
          </dl>

          <h4 className="mt-6 text-lg font-semibold text-[#15100D]">
            At-risk students
            <span className={`ml-2 font-normal ${muted}`}>
              ({pack.revenueChurn.atRisk.length})
            </span>
          </h4>
          {pack.revenueChurn.atRisk.length === 0 ? (
            <p className={`mt-3 ${muted}`}>No missed-lesson + quiet-practice combo right now.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#E6D7B8]">
              {pack.revenueChurn.atRisk.map((row) => (
                <li key={row.studentId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-[#15100D]">{row.name}</p>
                    <p className={muted}>{row.reason}</p>
                  </div>
                  <Button asChild variant="ghost" className="text-[#604A19]">
                    <Link to="/students/$studentId" params={{ studentId: row.studentId }}>
                      Open student
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <h4 className="mt-6 text-lg font-semibold text-[#15100D]">
            Make-up credit liability
            <span className={`ml-2 font-normal ${muted}`}>
              {formatAUD(pack.revenueChurn.makeupLiabilityCents)}
            </span>
          </h4>
          {pack.revenueChurn.makeupCredits.length === 0 ? (
            <p className={`mt-3 ${muted}`}>No open make-up credits.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#E6D7B8]">
              {pack.revenueChurn.makeupCredits.map((row) => (
                <li key={row.studentId} className="flex flex-wrap justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-[#15100D]">{row.name}</p>
                    <p className={muted}>
                      {row.creditBalance} credit{row.creditBalance === 1 ? "" : "s"} ·{" "}
                      {formatAUD(row.unitCents)} each
                    </p>
                  </div>
                  <p className="font-semibold text-[#15100D]">{formatAUD(row.liabilityCents)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <GstBar pack={pack} />

          <section className={panel} aria-label="Xero reconciliation queue">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[#604A19]">
                <Landmark className="size-5" aria-hidden />
                <h3 className={title}>Xero queue</h3>
              </div>
              <p className={muted}>
                {failedOrPending.length} open · mock sync, no live API poll
              </p>
            </div>
            {pack.xeroQueue.length === 0 ? (
              <p className={`mt-4 ${muted}`}>Queue is clear.</p>
            ) : (
              <ul className="mt-4 divide-y divide-[#E6D7B8]">
                {pack.xeroQueue.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                    <div>
                      <p className="font-semibold text-[#15100D]">
                        {row.number} · {row.familyName}
                      </p>
                      <p className={muted}>
                        {row.status === "failed"
                          ? row.lastError ?? "Failed"
                          : row.status === "pending"
                            ? "Pending push"
                            : "Synced"}{" "}
                        · {formatAUD(row.totalCents)}
                      </p>
                    </div>
                    {row.status !== "synced" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-[#CDBF9F]"
                        disabled={!pack.proEnabled || retry.isPending}
                        onClick={() => retry.mutate(row.invoiceId)}
                      >
                        <RefreshCw aria-hidden />
                        Retry
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={panel} aria-label="Teacher payouts">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#604A19]">
              <Wallet className="size-5" aria-hidden />
              <h3 className={title}>Teacher payouts</h3>
            </div>
            <p className={muted}>{formatAUD(pack.pulse.teacherPayoutCents)} contractors</p>
          </div>
          <ul className="mt-4 divide-y divide-[#E6D7B8]">
            {pack.payouts.map((row) => (
              <li key={row.teacherId} className="flex flex-wrap justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold text-[#15100D]">
                    {row.name}
                    <span className={`ml-2 font-normal ${muted}`}>
                      {row.kind === "owner" ? "Owner" : "Contractor"}
                    </span>
                  </p>
                  <p className={muted}>
                    {row.lessonsTaught} lessons
                    {row.kind === "contractor"
                      ? ` · ${formatAUD(row.rateCentsPerLesson)} each`
                      : " · keeps studio margin"}
                    {row.abn ? ` · ABN ${row.abn}` : ""}
                  </p>
                </div>
                <p className="font-semibold text-[#15100D]">{formatAUD(row.payoutCents)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-[#CDBF9F]"
              onClick={() => {
                const file = teacherRemittanceCsv(pack);
                downloadCsv(file.filename, file.csv);
                toast.success("Remittance CSV exported");
              }}
            >
              <Download aria-hidden />
              Export remittance
            </Button>
            <Button
              type="button"
              className="bg-bronze text-[#FBF7EE] hover:bg-bronze-hover"
              disabled={!pack.proEnabled || remittancePush.isPending}
              onClick={() => remittancePush.mutate()}
            >
              <Landmark aria-hidden />
              Push Xero Bills
            </Button>
          </div>
        </section>

        <section className={panel} aria-label="Overdue chaser">
          <div className="flex items-center gap-2 text-[#604A19]">
            <AlertTriangle className="size-5" aria-hidden />
            <h3 className={title}>Overdue chaser</h3>
          </div>
          <p className={`mt-2 ${muted}`}>
            Sends a family chat reminder with a mock payment link. Does not email or charge cards.
          </p>
          {pack.overdue.length === 0 ? (
            <p className={`mt-4 ${muted}`}>Nothing overdue to chase.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[#E6D7B8]">
              {pack.overdue.map((row) => (
                <li key={row.invoiceId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-[#15100D]">
                      {row.number} · {row.familyName}
                    </p>
                    <p className={muted}>
                      {formatAUD(row.balanceCents)} · {row.daysOverdue} day
                      {row.daysOverdue === 1 ? "" : "s"} overdue
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="ghost" className="text-[#604A19]">
                      <Link to="/invoices/$invoiceId" params={{ invoiceId: row.invoiceId }}>
                        Open
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-[#CDBF9F]"
                      disabled={chase.isPending}
                      onClick={() => chase.mutate(row.invoiceId)}
                    >
                      <Send aria-hidden />
                      Chase in chat
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
