import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Download,
  Mail,
  Receipt,
  Users,
  AlertTriangle,
  Music2,
  CalendarCheck2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatAUD, formatNumericDate } from "@/lib/format";
import { studioSnapshotQuery } from "@/lib/snapshot-queries";
import type { SnapshotRangeKey } from "@/lib/snapshot-range";
import {
  resendSnapshotInvitation,
  snapshotDrillCsv,
  type SnapshotTileId,
  type StudioSnapshot,
} from "@/services/snapshot";
import { TaxLitePanel } from "@/components/snapshot/TaxLitePanel";
import type { TaxLiteFyKey } from "@/lib/tax-lite-fy";

const TILES: Array<{
  id: SnapshotTileId;
  label: string;
  icon: typeof Receipt;
  emptyAction: { label: string; to: "/invoices" | "/students" | "/students/enrol" | "/" };
}> = [
  {
    id: "revenue",
    label: "Revenue collected",
    icon: Receipt,
    emptyAction: { label: "Create invoice", to: "/invoices" },
  },
  {
    id: "overdue",
    label: "Overdue",
    icon: AlertTriangle,
    emptyAction: { label: "Open invoices", to: "/invoices" },
  },
  {
    id: "students",
    label: "Active students",
    icon: Users,
    emptyAction: { label: "Enrol a student", to: "/students/enrol" },
  },
  {
    id: "invites",
    label: "Incomplete invites",
    icon: UserPlus,
    emptyAction: { label: "Send invites", to: "/students/enrol" },
  },
  {
    id: "practice",
    label: "Practice at risk",
    icon: Music2,
    emptyAction: { label: "Open students", to: "/students" },
  },
  {
    id: "lessons",
    label: "Lessons delivered",
    icon: CalendarCheck2,
    emptyAction: { label: "Mark attendance", to: "/" },
  },
];

function tileValue(snapshot: StudioSnapshot, id: SnapshotTileId): string {
  switch (id) {
    case "revenue":
      return formatAUD(snapshot.revenueCollectedCents);
    case "overdue":
      return formatAUD(snapshot.overdueCents);
    case "students":
      return String(snapshot.activeStudents.length);
    case "invites":
      return String(snapshot.incompleteInvites.length);
    case "practice":
      return String(snapshot.practiceAtRisk.length);
    case "lessons":
      return `${snapshot.lessons.taught} taught`;
  }
}

function tileHint(snapshot: StudioSnapshot, id: SnapshotTileId): string {
  switch (id) {
    case "revenue":
      return `${snapshot.paidInvoices.length} paid invoice${snapshot.paidInvoices.length === 1 ? "" : "s"}`;
    case "overdue":
      return `${snapshot.overdueInvoices.length} open`;
    case "students":
      return "On the roll";
    case "invites":
      return "Sent or opened";
    case "practice":
      return "Quiet or below threshold";
    case "lessons":
      return `${snapshot.lessons.cancelled} cancelled · ${snapshot.lessons.noShow} no-show`;
  }
}

function drillCount(snapshot: StudioSnapshot, id: SnapshotTileId): number {
  switch (id) {
    case "revenue":
      return snapshot.paidInvoices.length;
    case "overdue":
      return snapshot.overdueInvoices.length;
    case "students":
      return snapshot.activeStudents.length;
    case "invites":
      return snapshot.incompleteInvites.length;
    case "practice":
      return snapshot.practiceAtRisk.length;
    case "lessons":
      return snapshot.lessons.rows.length;
  }
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const LESSON_LABEL: Record<string, string> = {
  attended: "Taught",
  absent: "No-show",
  cancelled_by_studio: "Cancelled by studio",
  cancelled_late: "Late cancel",
  scheduled: "Scheduled",
};

export function StudioSnapshotPanel({
  range,
  onRangeChange,
  taxFy,
  onTaxFyChange,
}: {
  range: SnapshotRangeKey;
  onRangeChange: (range: SnapshotRangeKey) => void;
  taxFy: TaxLiteFyKey;
  onTaxFyChange: (fy: TaxLiteFyKey) => void;
}) {
  const { data } = useSuspenseQuery(studioSnapshotQuery(range));
  const [drill, setDrill] = useState<SnapshotTileId>("revenue");
  const client = useQueryClient();
  const resend = useMutation({
    mutationFn: (invitationId: string) => resendSnapshotInvitation(invitationId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["studio-snapshot"] });
      toast.success("Invitation resent");
    },
    onError: (error: Error) => toast.error(error.message || "Could not resend invitation."),
  });

  const empty = TILES.find((tile) => tile.id === drill)!;
  const count = drillCount(data, drill);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rounded-[2px] border border-[#D9C79E] bg-[#FBF7EE] px-5 py-6 md:px-8 md:py-8">
        <p className="text-base font-semibold uppercase tracking-[0.14em] text-[#604A19]">
          Keystone Music HQ
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[#15100D] md:text-4xl">
          Studio snapshot
        </h1>
        <p className="mt-2 max-w-2xl text-base text-[#5A4F43]">
          Money in, money owed, who's active, who's stuck in enrol, and who needs a practice nudge —
          for {data.bounds.start === data.bounds.end
            ? formatNumericDate(data.bounds.start)
            : `${formatNumericDate(data.bounds.start)}–${formatNumericDate(data.bounds.end)}`}{" "}
          ({data.bounds.timezone}).
        </p>
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Snapshot range">
          <Button
            type="button"
            variant={range === "week" ? "default" : "outline"}
            className={
              range === "week"
                ? "bg-[#604A19] text-[#FBF7EE] hover:bg-[#604A19]/90"
                : "border-[#CDBF9F] bg-[#F5EBD6] text-[#15100D]"
            }
            aria-pressed={range === "week"}
            onClick={() => onRangeChange("week")}
          >
            This week
          </Button>
          <Button
            type="button"
            variant={range === "month" ? "default" : "outline"}
            className={
              range === "month"
                ? "bg-[#604A19] text-[#FBF7EE] hover:bg-[#604A19]/90"
                : "border-[#CDBF9F] bg-[#F5EBD6] text-[#15100D]"
            }
            aria-pressed={range === "month"}
            onClick={() => onRangeChange("month")}
          >
            This month
          </Button>
        </div>
      </header>

      <section className="mt-6" aria-label="Snapshot tiles">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map(({ id, label, icon: Icon }) => {
            const selected = drill === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setDrill(id)}
                  className={`flex min-h-28 w-full flex-col items-start gap-1 rounded-[2px] border px-4 py-4 text-left transition-colors ${
                    selected
                      ? "border-[#C2A259] bg-[#FBF7EE] shadow-[inset_0_0_0_1px_#C2A259]"
                      : "border-[#D9C79E] bg-[#F5EBD6] hover:bg-[#FBF7EE]"
                  }`}
                >
                  <span className="flex items-center gap-2 text-base font-semibold text-[#604A19]">
                    <Icon className="size-5" aria-hidden />
                    {label}
                  </span>
                  <span className="font-display text-2xl font-semibold text-[#15100D]">
                    {tileValue(data, id)}
                  </span>
                  <span className="text-base text-[#5A4F43]">{tileHint(data, id)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="mt-8 rounded-[2px] border border-[#D9C79E] bg-[#FBF7EE] px-4 py-5 md:px-6"
        aria-label={`${empty.label} drill-down`}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#15100D]">{empty.label}</h2>
            <p className="mt-1 text-base text-[#5A4F43]">
              {count === 0 ? "Nothing here yet." : `${count} row${count === 1 ? "" : "s"}.`}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-[#CDBF9F] text-[#15100D]"
            disabled={count === 0}
            onClick={() => {
              const file = snapshotDrillCsv(drill, data);
              downloadCsv(file.filename, file.csv);
              toast.success("CSV exported");
            }}
          >
            <Download aria-hidden />
            Export CSV
          </Button>
        </div>

        {count === 0 ? (
          <p className="mt-6 text-lg text-[#5A4F43]">
            {empty.emptyAction.label === "Mark attendance"
              ? "No taught, cancelled or no-show marks in this range yet."
              : `No ${empty.label.toLowerCase()} in this view.`}{" "}
            <Link to={empty.emptyAction.to} className="font-semibold text-[#604A19] underline-offset-2 hover:underline">
              {empty.emptyAction.label}
            </Link>
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-[#E6D7B8]">
            {drill === "revenue" &&
              data.paidInvoices.map((row) => (
                <li key={row.invoiceId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-[#15100D]">
                      {row.number} · {row.familyName}
                    </p>
                    <p className="text-base text-[#5A4F43]">
                      Received {formatNumericDate(row.receivedOn)} · {formatAUD(row.paidInRangeCents)}
                    </p>
                  </div>
                  <Button asChild variant="ghost" className="text-[#604A19]">
                    <Link to="/invoices/$invoiceId" params={{ invoiceId: row.invoiceId }}>
                      Open invoice
                    </Link>
                  </Button>
                </li>
              ))}
            {drill === "overdue" &&
              data.overdueInvoices.map((row) => (
                <li key={row.invoiceId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-[#15100D]">
                      {row.number} · {row.familyName}
                    </p>
                    <p className="text-base text-[#5A4F43]">
                      {formatAUD(row.balanceCents)} · {row.daysOverdue} day{row.daysOverdue === 1 ? "" : "s"} overdue
                    </p>
                  </div>
                  <Button asChild variant="ghost" className="text-[#604A19]">
                    <Link to="/invoices/$invoiceId" params={{ invoiceId: row.invoiceId }}>
                      Open invoice
                    </Link>
                  </Button>
                </li>
              ))}
            {drill === "students" &&
              data.activeStudents.map((row) => (
                <li key={row.studentId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-[#15100D]">{row.name}</p>
                    <p className="text-base text-[#5A4F43]">
                      {row.familyName}
                      {row.gradeGoal ? ` · ${row.gradeGoal}` : ""}
                    </p>
                  </div>
                  <Button asChild variant="ghost" className="text-[#604A19]">
                    <Link to="/students/$studentId" params={{ studentId: row.studentId }}>
                      Open student
                    </Link>
                  </Button>
                </li>
              ))}
            {drill === "invites" &&
              data.incompleteInvites.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-[#15100D]">
                      {row.familyName} · {row.status}
                    </p>
                    <p className="text-base text-[#5A4F43]">
                      {row.studentNames} · {row.email}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#CDBF9F]"
                    disabled={resend.isPending}
                    onClick={() => resend.mutate(row.id)}
                  >
                    <Mail aria-hidden />
                    Resend
                  </Button>
                </li>
              ))}
            {drill === "practice" &&
              data.practiceAtRisk.map((row) => (
                <li key={row.studentId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-[#15100D]">{row.name}</p>
                    <p className="text-base text-[#5A4F43]">{row.reason}</p>
                  </div>
                  <Button asChild variant="ghost" className="text-[#604A19]">
                    <Link to="/students/$studentId" params={{ studentId: row.studentId }}>
                      Open student
                    </Link>
                  </Button>
                </li>
              ))}
            {drill === "lessons" &&
              data.lessons.rows.map((row) => (
                <li key={row.occurrenceId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-[#15100D]">
                      {row.studentName} · {LESSON_LABEL[row.status] ?? row.status}
                    </p>
                    <p className="text-base text-[#5A4F43]">{formatNumericDate(row.date)}</p>
                  </div>
                  <Button asChild variant="ghost" className="text-[#604A19]">
                    <Link to="/lessons/$lessonId" params={{ lessonId: row.occurrenceId }}>
                      Open lesson
                    </Link>
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <footer className="mt-6 flex flex-wrap gap-3 border-t border-[#D9C79E] pt-5 text-base">
        <Button asChild variant="outline" className="border-[#CDBF9F]">
          <Link to="/invoices">Open invoices</Link>
        </Button>
        <Button asChild variant="outline" className="border-[#CDBF9F]">
          <Link to="/students">Open students</Link>
        </Button>
        <Button
          type="button"
          className="bg-[#604A19] text-[#FBF7EE] hover:bg-[#604A19]/90"
          disabled={count === 0}
          onClick={() => {
            const file = snapshotDrillCsv(drill, data);
            downloadCsv(file.filename, file.csv);
            toast.success("CSV exported");
          }}
        >
          <Download aria-hidden />
          Export CSV for this list
        </Button>
      </footer>

      <TaxLitePanel fy={taxFy} onFyChange={onTaxFyChange} />
    </div>
  );
}
