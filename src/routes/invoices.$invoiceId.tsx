import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  Check,
  Download,
  FileMinus2,
  MessageCircleCheck,
  Printer,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InvoicePaper } from "@/components/InvoicePaper";
import { invoiceDetailQuery, paymentMethodLabel } from "@/lib/billing-queries";
import {
  changeDueDate,
  downloadInvoicePdf,
  getInvoiceEvents,
  issueCreditNote,
  recordPayment,
  resolveInvoiceQuery,
  reversePayment,
  voidInvoice,
} from "@/services/billing";
import { getBillingProfile } from "@/services/billing-profile";
import { stripeStatusQuery } from "@/lib/integration-queries";
import { queryOptions } from "@tanstack/react-query";
import { formatAUD, formatNumericDate } from "@/lib/format";
import type { PaymentMethod } from "@/mocks/types";
import { PROTOTYPE_TODAY } from "@/lib/calendar";

const billingProfileQuery = queryOptions({
  queryKey: ["billing-profile", "demo"],
  queryFn: () => getBillingProfile("demo"),
});

const eventsQuery = (id: string) =>
  queryOptions({
    queryKey: ["invoice-events", id],
    queryFn: () => getInvoiceEvents(id),
  });

export const Route = createFileRoute("/invoices/$invoiceId")({
  loader: async ({ context, params }) => {
    if (!(await context.queryClient.ensureQueryData(invoiceDetailQuery(params.invoiceId)))) throw notFound();
    await Promise.all([
      context.queryClient.ensureQueryData(billingProfileQuery),
      context.queryClient.ensureQueryData(stripeStatusQuery),
      context.queryClient.ensureQueryData(eventsQuery(params.invoiceId)),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Invoice detail — Keystone Music HQ" },
      { name: "description", content: "Printable piano lesson invoice, payment methods and paid status." },
      { property: "og:title", content: "Invoice detail — Keystone Music HQ" },
      { property: "og:description", content: "Printable piano lesson invoice, payment methods and paid status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  notFoundComponent: () => <p>Invoice not found.</p>,
  errorComponent: () => <p role="alert">Invoice could not be opened. Please refresh to try again.</p>,
  component: InvoiceDetail,
});

const PAY_METHODS: PaymentMethod[] = [
  "bank_transfer",
  "payid",
  "cash",
  "card_in_person",
  "stripe_payto",
  "stripe_becs",
  "stripe_card",
];

function InvoiceDetail() {
  const { invoiceId } = Route.useParams();
  const { data } = useSuspenseQuery(invoiceDetailQuery(invoiceId));
  const { data: profile } = useSuspenseQuery(billingProfileQuery);
  const { data: stripeStatus } = useSuspenseQuery(stripeStatusQuery);
  const { data: events } = useSuspenseQuery(eventsQuery(invoiceId));
  const client = useQueryClient();
  const [amountDollars, setAmountDollars] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [dueDate, setDueDate] = useState(data?.invoice.dueDate ?? PROTOTYPE_TODAY);
  const [voidReason, setVoidReason] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditDollars, setCreditDollars] = useState("");

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["invoice", invoiceId] }),
      client.invalidateQueries({ queryKey: ["invoices"] }),
      client.invalidateQueries({ queryKey: ["invoice-events", invoiceId] }),
      client.invalidateQueries({ queryKey: ["parent"] }),
      client.invalidateQueries({ queryKey: ["integrations"] }),
    ]);
  };

  const recording = useMutation({
    mutationFn: (input?: { amountCents?: number; method?: PaymentMethod }) => {
      const openBalance = data!.invoice.balanceCents ?? data!.invoice.totalCents;
      const cents =
        input?.amountCents ??
        (amountDollars.trim() === "" ? openBalance : Math.round(Number(amountDollars) * 100));
      return recordPayment(invoiceId, {
        method: input?.method ?? method,
        amountCents: cents,
      });
    },
    onSuccess: async () => {
      setAmountDollars("");
      await refresh();
      toast.success("Payment recorded");
    },
    onError: (error: Error) => toast.error(error.message || "Payment could not be recorded."),
  });

  const reversing = useMutation({
    mutationFn: (paymentId: string) => reversePayment(paymentId),
    onSuccess: async () => {
      await refresh();
      toast.success("Payment reversed");
    },
    onError: (error: Error) => toast.error(error.message || "Payment could not be reversed."),
  });

  const voiding = useMutation({
    mutationFn: () => voidInvoice(invoiceId, voidReason.trim() || "Voided"),
    onSuccess: async () => {
      await refresh();
      toast.success("Invoice voided");
    },
    onError: (error: Error) => toast.error(error.message || "Invoice could not be voided."),
  });

  const crediting = useMutation({
    mutationFn: () =>
      issueCreditNote({
        familyId: data!.invoice.familyId,
        invoiceId,
        amountCents: Math.round(Number(creditDollars) * 100),
        reason: creditReason.trim() || "Credit note",
      }),
    onSuccess: async () => {
      setCreditDollars("");
      setCreditReason("");
      await refresh();
      toast.success("Credit note issued");
    },
    onError: (error: Error) => toast.error(error.message || "Credit note could not be issued."),
  });

  const changingDue = useMutation({
    mutationFn: () => changeDueDate(invoiceId, dueDate),
    onSuccess: async () => {
      await refresh();
      toast.success("Due date updated");
    },
    onError: (error: Error) => toast.error(error.message || "Due date could not be changed."),
  });

  const resolving = useMutation({
    mutationFn: () => resolveInvoiceQuery(invoiceId),
    onSuccess: async () => {
      await refresh();
      toast.success("Query marked resolved");
    },
    onError: (error: Error) => toast.error(error.message || "Query could not be resolved."),
  });

  const downloading = useMutation({
    mutationFn: () => downloadInvoicePdf(invoiceId),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    },
    onError: (error: Error) => toast.error(error.message || "PDF could not be downloaded."),
  });

  if (!data) return null;
  const { invoice, studio, family } = data;
  const balance = invoice.balanceCents ?? invoice.totalCents;
  const openQuery = Boolean(invoice.queriedAt && !invoice.queryResolvedAt);
  const canPay = invoice.status !== "paid" && invoice.status !== "void" && balance > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="invoice-actions mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost">
          <Link to="/invoices">
            <ArrowLeft aria-hidden /> All invoices
          </Link>
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer aria-hidden /> Print
        </Button>
        <Button variant="outline" disabled={downloading.isPending} onClick={() => downloading.mutate()}>
          <Download aria-hidden /> {downloading.isPending ? "Preparing…" : "Download PDF"}
        </Button>
        {canPay && (
          <Button
            className="w-full sm:ml-auto sm:w-auto"
            disabled={recording.isPending}
            onClick={() =>
              recording.mutate({ amountCents: balance, method: "bank_transfer" })
            }
          >
            <Check aria-hidden /> {recording.isPending ? "Saving…" : "Mark as paid"}
          </Button>
        )}
      </div>

      <InvoicePaper
        invoice={invoice}
        studio={studio}
        family={family}
        payTo={profile.payTo}
        stripeConnected={stripeStatus === "connected"}
        discount={studio.billing?.paymentDiscount}
      />

      <section className="invoice-actions mt-8 space-y-8 border-t border-border pt-6" aria-label="Invoice actions">
        {canPay && (
          <div>
            <h2 className="text-xl font-semibold">Record payment</h2>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="font-semibold">
                Amount (AUD)
                <Input
                  className="mt-2 w-36"
                  inputMode="decimal"
                  placeholder={(balance / 100).toFixed(2)}
                  value={amountDollars}
                  onChange={(event) => setAmountDollars(event.target.value)}
                />
              </label>
              <label className="font-semibold">
                Method
                <select
                  className="mt-2 block min-h-12 rounded-md border border-input bg-card px-3"
                  value={method}
                  onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                >
                  {PAY_METHODS.map((value) => (
                    <option key={value} value={value}>
                      {paymentMethodLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <Button disabled={recording.isPending} onClick={() => recording.mutate({})}>
                {recording.isPending ? "Saving…" : "Record payment"}
              </Button>
            </div>
          </div>
        )}

        {!!invoice.payments?.length && (
          <div>
            <h2 className="text-xl font-semibold">Reverse a payment</h2>
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {invoice.payments
                .filter((payment) => payment.amountCents > 0 && !invoice.payments?.some((other) => other.reversesPaymentId === payment.id))
                .map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="text-base">
                      {formatNumericDate(payment.receivedOn ?? payment.date ?? invoice.issueDate)} ·{" "}
                      {paymentMethodLabel(payment.method)} · {formatAUD(payment.amountCents)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reversing.isPending}
                      onClick={() => reversing.mutate(payment.id)}
                    >
                      <RotateCcw aria-hidden /> Reverse
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {invoice.status !== "void" && (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-xl font-semibold">Change due date</h2>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="font-semibold">
                  Due date
                  <Input
                    type="date"
                    className="mt-2"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
                <Button variant="outline" disabled={changingDue.isPending} onClick={() => changingDue.mutate()}>
                  <CalendarClock aria-hidden />
                  {changingDue.isPending ? "Saving…" : "Update"}
                </Button>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold">Void invoice</h2>
              <label className="mt-3 block font-semibold">
                Reason
                <Input className="mt-2" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
              </label>
              <Button className="mt-3" variant="outline" disabled={voiding.isPending} onClick={() => voiding.mutate()}>
                <Ban aria-hidden />
                {voiding.isPending ? "Voiding…" : "Void"}
              </Button>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xl font-semibold">Issue credit note</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="font-semibold">
              Amount (AUD)
              <Input
                className="mt-2 w-36"
                inputMode="decimal"
                value={creditDollars}
                onChange={(event) => setCreditDollars(event.target.value)}
              />
            </label>
            <label className="font-semibold">
              Reason
              <Input className="mt-2" value={creditReason} onChange={(event) => setCreditReason(event.target.value)} />
            </label>
            <Button variant="outline" disabled={crediting.isPending} onClick={() => crediting.mutate()}>
              <FileMinus2 aria-hidden />
              {crediting.isPending ? "Issuing…" : "Issue credit note"}
            </Button>
          </div>
        </div>

        {openQuery && (
          <div>
            <h2 className="text-xl font-semibold">Family query</h2>
            <p className="mt-2 text-base text-muted-foreground">
              This invoice was queried. Reminders pause until you mark it resolved.
            </p>
            <Button className="mt-3" disabled={resolving.isPending} onClick={() => resolving.mutate()}>
              <MessageCircleCheck aria-hidden />
              {resolving.isPending ? "Saving…" : "Mark query resolved"}
            </Button>
          </div>
        )}

        <div>
          <h2 className="text-xl font-semibold">Event timeline</h2>
          {events.length === 0 ? (
            <p className="mt-3 text-base text-muted-foreground">No events yet.</p>
          ) : (
            <ol className="mt-3 divide-y divide-border border-y border-border">
              {events.map((event) => (
                <li key={event.id} className="py-3 text-base">
                  <span className="font-semibold">{event.kind.replaceAll("_", " ")}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {new Intl.DateTimeFormat("en-AU", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Australia/Melbourne",
                    }).format(new Date(event.at))}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
