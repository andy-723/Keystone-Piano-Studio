import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Download,
  Home,
  Receipt,
  Car,
  Landmark,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAUD, formatNumericDate } from "@/lib/format";
import { PROTOTYPE_TODAY } from "@/lib/calendar";
import type { TaxLiteFyKey } from "@/lib/tax-lite-fy";
import {
  taxLiteCategoriesQuery,
  taxLitePackQuery,
  taxLiteStudentsQuery,
} from "@/lib/tax-lite-queries";
import type { TaxLiteCategory } from "@/mocks/tax-lite";
import {
  logTaxLiteExpense,
  logTaxLiteKm,
  setTaxLiteAdminHours,
  taxLiteEofyCsv,
} from "@/services/tax-lite";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function dollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function TaxLitePanel({
  fy,
  onFyChange,
}: {
  fy: TaxLiteFyKey;
  onFyChange: (fy: TaxLiteFyKey) => void;
}) {
  const { data: pack } = useSuspenseQuery(taxLitePackQuery(fy));
  const { data: students } = useSuspenseQuery(taxLiteStudentsQuery());
  const { data: categories } = useSuspenseQuery(taxLiteCategoriesQuery());
  const client = useQueryClient();

  const [date, setDate] = useState(PROTOTYPE_TODAY);
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState<TaxLiteCategory>(categories[0]!);
  const [amount, setAmount] = useState("");
  const [includesGst, setIncludesGst] = useState(false);
  const [passThrough, setPassThrough] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [notes, setNotes] = useState("");
  const [adminHours, setAdminHours] = useState(String(pack.homeStudio.adminHours));
  useEffect(() => {
    setAdminHours(String(pack.homeStudio.adminHours));
  }, [pack.homeStudio.adminHours, pack.bounds.fyLabel]);
  const [kmDate, setKmDate] = useState(PROTOTYPE_TODAY);
  const [km, setKm] = useState("");
  const [kmPurpose, setKmPurpose] = useState("");

  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["tax-lite"] });
  };

  const logExpense = useMutation({
    mutationFn: () => {
      const amountCents = dollarsToCents(amount);
      if (amountCents == null) throw new Error("Enter a positive amount in dollars");
      if (passThrough && !studentId) throw new Error("Choose a student to pass the cost on to");
      return logTaxLiteExpense({
        date,
        vendor,
        category,
        amountCents,
        includesGst,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(passThrough && studentId ? { passThroughStudentId: studentId } : {}),
      });
    },
    onSuccess: async (expense) => {
      await invalidate();
      setVendor("");
      setAmount("");
      setNotes("");
      setPassThrough(false);
      setStudentId("");
      setIncludesGst(false);
      toast.success(
        expense.attachedInvoiceId
          ? "Expense logged and added to the family's draft invoice"
          : "Expense logged",
      );
    },
    onError: (error: Error) => toast.error(error.message || "Could not log expense."),
  });

  const saveAdmin = useMutation({
    mutationFn: () => {
      const hours = Number(adminHours);
      if (!Number.isFinite(hours) || hours < 0) throw new Error("Enter zero or more admin hours");
      return setTaxLiteAdminHours(hours, pack.bounds.fyLabel);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Admin hours saved");
    },
    onError: (error: Error) => toast.error(error.message || "Could not save admin hours."),
  });

  const saveKm = useMutation({
    mutationFn: () => {
      const kilometres = Number(km);
      if (!Number.isFinite(kilometres) || kilometres <= 0) throw new Error("Enter kilometres driven");
      return logTaxLiteKm({ date: kmDate, kilometres, purpose: kmPurpose });
    },
    onSuccess: async () => {
      await invalidate();
      setKm("");
      setKmPurpose("");
      toast.success("Kilometres logged");
    },
    onError: (error: Error) => toast.error(error.message || "Could not log kilometres."),
  });

  const rangeLabel =
    pack.bounds.start === pack.bounds.end
      ? formatNumericDate(pack.bounds.start)
      : `${formatNumericDate(pack.bounds.start)}–${formatNumericDate(pack.bounds.end)}`;

  return (
    <section
      className="mt-10 rounded-[2px] border border-[#D9C79E] bg-[#FBF7EE] px-5 py-6 md:px-8 md:py-8"
      aria-labelledby="tax-lite-heading"
      data-tour="tax-lite"
    >
      <header>
        <p className="text-base font-semibold uppercase tracking-[0.14em] text-[#604A19]">
          Accounting Lite
        </p>
        <h2 id="tax-lite-heading" className="mt-2 font-display text-2xl font-semibold text-[#15100D] md:text-3xl">
          Tax Lite
        </h2>
        <p className="mt-2 max-w-2xl text-base text-[#5A4F43]">
          Pass-throughs, Stripe gross vs fees, and home-studio hours for myTax — not a second ledger.
          FY {pack.bounds.fyLabel} · {rangeLabel} ({pack.bounds.timezone}).
        </p>
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Tax Lite range">
          <Button
            type="button"
            variant={fy === "ytd" ? "default" : "outline"}
            className={
              fy === "ytd"
                ? "bg-[#604A19] text-[#FBF7EE] hover:bg-[#604A19]/90"
                : "border-[#CDBF9F] bg-[#F5EBD6] text-[#15100D]"
            }
            onClick={() => onFyChange("ytd")}
          >
            Year to date
          </Button>
          <Button
            type="button"
            variant={fy === "fy" ? "default" : "outline"}
            className={
              fy === "fy"
                ? "bg-[#604A19] text-[#FBF7EE] hover:bg-[#604A19]/90"
                : "border-[#CDBF9F] bg-[#F5EBD6] text-[#15100D]"
            }
            onClick={() => onFyChange("fy")}
          >
            Full FY (1 Jul–30 Jun)
          </Button>
        </div>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-[2px] border border-[#E6D7B8] bg-[#F5EBD6] p-4">
          <p className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.08em] text-[#604A19]">
            <Landmark className="size-4" aria-hidden />
            Gross tuition
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-[#15100D]">
            {formatAUD(pack.stripe.grossTuitionCents)}
          </p>
          <p className="mt-1 text-base text-[#5A4F43]">
            {pack.stripe.paymentCount === 0
              ? "No Stripe payments in this range yet"
              : `${pack.stripe.paymentCount} Stripe payment${pack.stripe.paymentCount === 1 ? "" : "s"}`}
          </p>
        </article>
        <article className="rounded-[2px] border border-[#E6D7B8] bg-[#F5EBD6] p-4">
          <p className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.08em] text-[#604A19]">
            <Receipt className="size-4" aria-hidden />
            Merchant fees
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-[#15100D]">
            {formatAUD(pack.stripe.merchantFeesCents)}
          </p>
          <p className="mt-1 text-base text-[#5A4F43]">
            {pack.stripe.derivedFeeCount > 0
              ? `${pack.stripe.storedFeeCount} stored · ${pack.stripe.derivedFeeCount} derived estimates`
              : pack.stripe.storedFeeCount > 0
                ? "From stored Stripe fee fields"
                : "Record a Stripe payment to see fees"}
          </p>
        </article>
        <article className="rounded-[2px] border border-[#E6D7B8] bg-[#F5EBD6] p-4 sm:col-span-2 lg:col-span-1">
          <p className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.08em] text-[#604A19]">
            <Home className="size-4" aria-hidden />
            Home studio (70c/hr)
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-[#15100D]">
            {formatAUD(pack.homeStudio.estimateCents)}
          </p>
          <p className="mt-1 text-base text-[#5A4F43]">
            {pack.homeStudio.totalHours === 0
              ? "No teaching hours in range — schedule lessons or add admin time"
              : `${pack.homeStudio.totalHours} hrs · ${pack.homeStudio.teachingHours} teaching + ${pack.homeStudio.adminHours} admin`}
          </p>
        </article>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <form
          className="space-y-4"
          aria-label="Log billable client expense"
          onSubmit={(event) => {
            event.preventDefault();
            logExpense.mutate();
          }}
        >
          <h3 className="font-display text-xl font-semibold text-[#15100D]">
            Billable client expenses
          </h3>
          <p className="text-base text-[#5A4F43]">
            Log an AMEB fee or method book. Pass it on to a student and it lands on their next draft
            as a reimbursement — not pure tuition.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tax-exp-date">Date</Label>
              <Input
                id="tax-exp-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1 border-[#CDBF9F] bg-[#FBF7EE]"
                required
              />
            </div>
            <div>
              <Label htmlFor="tax-exp-amount">Amount (AUD)</Label>
              <Input
                id="tax-exp-amount"
                inputMode="decimal"
                placeholder="95.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="mt-1 border-[#CDBF9F] bg-[#FBF7EE]"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="tax-exp-vendor">Vendor</Label>
            <Input
              id="tax-exp-vendor"
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
              placeholder="AMEB Victoria"
              className="mt-1 border-[#CDBF9F] bg-[#FBF7EE]"
              required
            />
          </div>
          <div>
            <Label htmlFor="tax-exp-category">Category</Label>
            <select
              id="tax-exp-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as TaxLiteCategory)}
              className="mt-1 flex h-10 w-full rounded-md border border-[#CDBF9F] bg-[#FBF7EE] px-3 text-base"
            >
              {categories.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="tax-exp-notes">Notes (optional)</Label>
            <Input
              id="tax-exp-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 border-[#CDBF9F] bg-[#FBF7EE]"
            />
          </div>
          <label className="flex items-center gap-3 text-base text-[#15100D]">
            <input
              type="checkbox"
              checked={includesGst}
              onChange={(event) => setIncludesGst(event.target.checked)}
              className="size-4 accent-[#604A19]"
            />
            Amount includes GST
          </label>
          <label className="flex items-center gap-3 text-base text-[#15100D]">
            <input
              type="checkbox"
              checked={passThrough}
              onChange={(event) => setPassThrough(event.target.checked)}
              className="size-4 accent-[#604A19]"
            />
            Pass this cost on to a student
          </label>
          {passThrough && (
            <div>
              <Label htmlFor="tax-exp-student">Student</Label>
              <select
                id="tax-exp-student"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-[#CDBF9F] bg-[#FBF7EE] px-3 text-base"
                required={passThrough}
              >
                <option value="">Choose student…</option>
                {students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.name} · {student.familyName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button
            type="submit"
            className="bg-[#604A19] text-[#FBF7EE] hover:bg-[#604A19]/90"
            disabled={logExpense.isPending}
          >
            <Plus aria-hidden />
            Log expense
          </Button>
        </form>

        <div>
          <h3 className="font-display text-xl font-semibold text-[#15100D]">Expense log</h3>
          {pack.expenses.length === 0 ? (
            <p className="mt-3 text-base text-[#5A4F43]">
              No Tax Lite expenses in this range yet. Log a pass-through or studio cost on the left.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#E6D7B8]">
              {pack.expenses.map((expense) => (
                <li key={expense.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-[#15100D]">{expense.vendor}</p>
                    <p className="font-semibold text-[#15100D]">{formatAUD(expense.amountCents)}</p>
                  </div>
                  <p className="text-base text-[#5A4F43]">
                    {formatNumericDate(expense.date)} · {expense.category}
                    {expense.includesGst ? " · incl. GST" : ""}
                    {expense.passThroughStudentId ? " · passed to student" : ""}
                  </p>
                  {expense.attachedInvoiceId && (
                    <p className="mt-1">
                      <Link
                        to="/invoices/$invoiceId"
                        params={{ invoiceId: expense.attachedInvoiceId }}
                        className="font-semibold text-[#604A19] underline-offset-2 hover:underline"
                      >
                        Open draft invoice
                      </Link>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-base text-[#5A4F43]">
            Total logged: <span className="font-semibold text-[#15100D]">{formatAUD(pack.expenseTotalCents)}</span>
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 border-t border-[#D9C79E] pt-8 lg:grid-cols-2">
        <form
          className="space-y-4"
          aria-label="Home studio admin hours"
          onSubmit={(event) => {
            event.preventDefault();
            saveAdmin.mutate();
          }}
        >
          <h3 className="font-display text-xl font-semibold text-[#15100D]">Home studio hours</h3>
          <p className="text-base text-[#5A4F43]">
            Teaching hours come from your timetable (scheduled and taught lessons). Add admin hours
            for planning, invoicing, and prep claimed under the ATO Fixed Rate Method (70c per hour).
          </p>
          <div className="max-w-xs">
            <Label htmlFor="tax-admin-hours">Admin hours (FY {pack.bounds.fyLabel})</Label>
            <Input
              id="tax-admin-hours"
              inputMode="decimal"
              value={adminHours}
              onChange={(event) => setAdminHours(event.target.value)}
              className="mt-1 border-[#CDBF9F] bg-[#FBF7EE]"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="border-[#CDBF9F]"
            disabled={saveAdmin.isPending}
          >
            Save admin hours
          </Button>
        </form>

        <form
          className="space-y-4"
          aria-label="Kilometre log"
          onSubmit={(event) => {
            event.preventDefault();
            saveKm.mutate();
          }}
        >
          <h3 className="flex items-center gap-2 font-display text-xl font-semibold text-[#15100D]">
            <Car className="size-5" aria-hidden />
            Kilometre log
          </h3>
          <p className="text-base text-[#5A4F43]">
            Optional light log for school visits and mobile teaching — not a full logbook product.
          </p>
          {pack.kmEntries.length === 0 ? (
            <p className="text-base text-[#5A4F43]">No kilometres logged in this range.</p>
          ) : (
            <ul className="divide-y divide-[#E6D7B8]">
              {pack.kmEntries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-2 text-base">
                  <span className="text-[#5A4F43]">
                    {formatNumericDate(entry.date)} · {entry.purpose}
                  </span>
                  <span className="font-semibold text-[#15100D]">{entry.kilometres} km</span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="tax-km-date">Date</Label>
              <Input
                id="tax-km-date"
                type="date"
                value={kmDate}
                onChange={(event) => setKmDate(event.target.value)}
                className="mt-1 border-[#CDBF9F] bg-[#FBF7EE]"
                required
              />
            </div>
            <div>
              <Label htmlFor="tax-km-km">Kilometres</Label>
              <Input
                id="tax-km-km"
                inputMode="decimal"
                value={km}
                onChange={(event) => setKm(event.target.value)}
                className="mt-1 border-[#CDBF9F] bg-[#FBF7EE]"
                required
              />
            </div>
            <div className="sm:col-span-1">
              <Label htmlFor="tax-km-purpose">Purpose</Label>
              <Input
                id="tax-km-purpose"
                value={kmPurpose}
                onChange={(event) => setKmPurpose(event.target.value)}
                className="mt-1 border-[#CDBF9F] bg-[#FBF7EE]"
                required
              />
            </div>
          </div>
          <Button
            type="submit"
            variant="outline"
            className="border-[#CDBF9F]"
            disabled={saveKm.isPending}
          >
            Log kilometres
          </Button>
          {pack.kmTotal > 0 && (
            <p className="text-base text-[#5A4F43]">
              {pack.kmTotal} km · estimate {formatAUD(pack.kmEstimateCents)}
            </p>
          )}
        </form>
      </div>

      <footer className="mt-8 flex flex-wrap gap-3 border-t border-[#D9C79E] pt-5">
        <Button
          type="button"
          className="bg-[#604A19] text-[#FBF7EE] hover:bg-[#604A19]/90"
          onClick={() => {
            const file = taxLiteEofyCsv(pack);
            downloadCsv(file.filename, file.csv);
            toast.success("Tax pack CSV exported");
          }}
        >
          <Download aria-hidden />
          Export EOFY / tax pack CSV
        </Button>
        <Button asChild variant="outline" className="border-[#CDBF9F]">
          <Link to="/invoices">Open invoices</Link>
        </Button>
      </footer>
    </section>
  );
}
