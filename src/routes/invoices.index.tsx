import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, CircleAlert, FilePlus2, Plus, Receipt, RefreshCw, Bell } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  invoiceListQuery,
  INVOICE_STATUS,
  invoiceDisplayStatus,
  invoiceNumberLabel,
  matchesInvoiceFilter,
  type InvoiceFilterKey,
} from "@/lib/billing-queries";
import { paymentFlags } from "@/services/billing";
import { applyLateFee, runBillingSchedule, sendPauseNotice, waiveLateFee } from "@/services/billing-reminders";
import { formatAUD, formatNumericDate } from "@/lib/format";

export const Route = createFileRoute("/invoices/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(invoiceListQuery),
  head: () => ({
    meta: [
      { title: "Family invoices — Keystone Music HQ" },
      { name: "description", content: "Keystone Music HQ term invoices, balances and payment status." },
      { property: "og:title", content: "Family invoices — Keystone Music HQ" },
      { property: "og:description", content: "Keystone Music HQ term invoices, balances and payment status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => <p role="alert">Invoices could not be opened. Please refresh to try again.</p>,
  component: Invoices,
});

function Invoices() {
  const { data } = useSuspenseQuery(invoiceListQuery);
  const [filter, setFilter] = useState<InvoiceFilterKey>("all");
  const client = useQueryClient();
  const sumStatus = (statuses: Array<"draft" | "sent" | "partially_paid" | "paid">) =>
    data.invoices
      .filter((invoice) => statuses.includes(invoice.status as "draft" | "sent" | "partially_paid" | "paid"))
      .reduce(
        (total, invoice) =>
          total +
          (statuses.includes("paid") || statuses.includes("draft")
            ? invoice.totalCents
            : (invoice.balanceCents ?? invoice.totalCents)),
        0,
      );
  const overdueTotal = data.invoices
    .filter((invoice) => invoice.isOverdue)
    .reduce((total, invoice) => total + (invoice.balanceCents ?? invoice.totalCents), 0);
  const shown = data.invoices.filter((invoice) =>
    matchesInvoiceFilter(invoice, filter === "all" ? "all" : filter),
  );
  const flags = paymentFlags(data.invoices);
  const familyName = (id: string) => data.families.find((family) => family.id === id)?.displayName ?? "Family";

  const reminders = useMutation({
    mutationFn: () => runBillingSchedule("demo"),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["invoices"] });
      if (!result.ran) {
        toast.message("Billing automation needs Pro");
        return;
      }
      toast.success(
        result.actions.length
          ? `Reminders ran · ${result.actions.length} action${result.actions.length === 1 ? "" : "s"}`
          : "Reminders ran · nothing due today",
      );
    },
    onError: () => toast.error("Reminders could not be run."),
  });

  const chase = useMutation({
    mutationFn: async ({
      invoiceId,
      action,
    }: {
      invoiceId: string;
      action: "late_fee" | "waive" | "pause";
    }) => {
      if (action === "late_fee") return applyLateFee(invoiceId);
      if (action === "waive") return waiveLateFee(invoiceId);
      return sendPauseNotice(invoiceId);
    },
    onSuccess: async (_result, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["invoices"] }),
        client.invalidateQueries({ queryKey: ["invoice"] }),
      ]);
      toast.success(
        variables.action === "late_fee"
          ? "Late fee applied"
          : variables.action === "waive"
            ? "Late fee waived"
            : "Pause notice sent",
      );
    },
    onError: (error: Error) => toast.error(error.message || "Action could not be completed."),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <h1 className="flex items-center gap-3 text-3xl font-semibold">
          <Receipt className="size-7 text-primary" aria-hidden /> Invoices
        </h1>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="max-w-full whitespace-normal">
            <Link to="/invoices/new">
              <Plus aria-hidden /> New invoice
            </Link>
          </Button>
          <Button asChild variant="outline" className="max-w-full whitespace-normal">
            <Link to="/invoices/prepare">
              <FilePlus2 aria-hidden /> Bill next term
            </Link>
          </Button>
          <Button asChild variant="outline" className="max-w-full whitespace-normal">
            <Link to="/invoices/renewals">
              <RefreshCw aria-hidden /> Renewal invitations & reminders
            </Link>
          </Button>
          <Button
            variant="outline"
            className="max-w-full whitespace-normal"
            disabled={reminders.isPending}
            onClick={() => reminders.mutate()}
          >
            <Bell aria-hidden />
            {reminders.isPending ? "Running…" : "Run today's reminders"}
          </Button>
        </div>
      </header>

      {flags.length > 0 && (
        <section aria-label="Payments to chase" className="mt-7 rounded-lg border border-destructive/40 bg-destructive/5 p-5">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <CircleAlert className="size-6 text-destructive" aria-hidden /> Payments to chase
          </h2>
          <p className="mt-1 text-base text-muted-foreground">
            {flags.filter((flag) => flag.kind === "overdue").length} overdue ·{" "}
            {flags.filter((flag) => flag.kind === "due_soon").length} due in the next 7 days
          </p>
          <div className="mt-4 divide-y divide-border border-y border-border">
            {flags.map((flag) => (
              <div key={flag.invoice.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                <Button asChild variant="ghost" className="h-auto flex-1 justify-start whitespace-normal rounded-none px-1 py-2 text-left">
                  <Link to="/invoices/$invoiceId" params={{ invoiceId: flag.invoice.id }}>
                    <div className="grid min-w-0 flex-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <div>
                        <p className="text-lg font-semibold">{familyName(flag.invoice.familyId)}</p>
                        <p className="mt-0.5 text-base font-normal text-muted-foreground">
                          {invoiceNumberLabel(flag.invoice)} · Due {formatNumericDate(flag.invoice.dueDate)}
                        </p>
                        {flag.invoice.queriedAt && !flag.invoice.queryResolvedAt && (
                          <Badge variant="secondary" className="mt-2 text-base">
                            Queried
                          </Badge>
                        )}
                      </div>
                      <Badge variant={flag.kind === "overdue" ? "destructive" : "secondary"} className="text-base">
                        {flag.kind === "overdue"
                          ? `${flag.days} day${flag.days === 1 ? "" : "s"} overdue`
                          : flag.days === 0
                            ? "Due today"
                            : `Due in ${flag.days} day${flag.days === 1 ? "" : "s"}`}
                      </Badge>
                      <span className="text-lg sm:text-right">
                        {formatAUD(flag.invoice.balanceCents ?? flag.invoice.totalCents)}
                      </span>
                    </div>
                    <ArrowRight aria-hidden className="ml-3" />
                  </Link>
                </Button>
                {flag.kind === "overdue" && (
                  <div className="flex flex-wrap gap-2 px-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={chase.isPending}
                      onClick={() => chase.mutate({ invoiceId: flag.invoice.id, action: "late_fee" })}
                    >
                      Apply late fee
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={chase.isPending}
                      onClick={() => chase.mutate({ invoiceId: flag.invoice.id, action: "waive" })}
                    >
                      Waive
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={chase.isPending}
                      onClick={() => chase.mutate({ invoiceId: flag.invoice.id, action: "pause" })}
                    >
                      Send pause notice
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Invoice totals" className="mt-7 grid grid-cols-2 gap-5 border-y border-border py-6 lg:grid-cols-4">
        {[
          { name: "Draft total", value: sumStatus(["draft"]) },
          { name: "Sent total", value: sumStatus(["sent", "partially_paid"]) },
          { name: "Overdue total", value: overdueTotal },
          { name: "Paid total", value: sumStatus(["paid"]) },
        ].map((total) => (
          <div key={total.name}>
            <p className="text-base text-muted-foreground">{total.name}</p>
            <p className="mt-2 break-words font-display text-2xl font-semibold">{formatAUD(total.value)}</p>
          </div>
        ))}
      </section>

      <div className="my-6 flex flex-wrap gap-2" role="group" aria-label="Filter invoice status">
        {(["all", "draft", "sent", "overdue", "paid"] as const).map((key) => (
          <Button
            key={key}
            variant={filter === key ? "secondary" : "ghost"}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {key === "all" ? "All" : INVOICE_STATUS[key]}
          </Button>
        ))}
      </div>

      <p className="mb-3 text-base text-muted-foreground">
        {shown.length} invoices · {formatAUD(shown.reduce((total, invoice) => total + invoice.totalCents, 0))}
      </p>

      <div className="divide-y divide-border border-y border-border">
        {shown.map((invoice) => (
          <Button
            key={invoice.id}
            asChild
            variant="ghost"
            className="h-auto w-full justify-start whitespace-normal rounded-none px-1 py-5 text-left"
          >
            <Link to="/invoices/$invoiceId" params={{ invoiceId: invoice.id }}>
              <div className="grid min-w-0 flex-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
                <div>
                  <p className="text-xl font-semibold">
                    {data.families.find((family) => family.id === invoice.familyId)?.displayName}
                  </p>
                  <p className="mt-1 text-base font-normal text-muted-foreground">
                    {invoiceNumberLabel(invoice)} · Due {formatNumericDate(invoice.dueDate)}
                  </p>
                  {invoice.queriedAt && !invoice.queryResolvedAt && (
                    <Badge variant="secondary" className="mt-2 text-base">
                      Queried
                    </Badge>
                  )}
                  {invoice.xeroSyncedAt && (
                    <Badge variant="secondary" className="mt-2 text-base">
                      Sent to Xero
                    </Badge>
                  )}
                </div>
                <span
                  className={`text-base ${
                    invoice.isOverdue
                      ? "text-destructive"
                      : invoice.status === "paid"
                        ? "text-success"
                        : "text-muted-foreground"
                  }`}
                >
                  {invoiceDisplayStatus(invoice)}
                </span>
                <span className="text-xl sm:text-right">
                  {formatAUD(
                    invoice.status === "partially_paid" || invoice.isOverdue
                      ? (invoice.balanceCents ?? invoice.totalCents)
                      : invoice.totalCents,
                  )}
                </span>
              </div>
              <ArrowRight aria-hidden className="ml-3" />
            </Link>
          </Button>
        ))}
      </div>
      {shown.length === 0 && <p className="py-8 text-muted-foreground">No invoices with this status.</p>}
    </div>
  );
}
