import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, CircleAlert, FilePlus2, Receipt, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { invoiceListQuery, INVOICE_STATUS } from "@/lib/billing-queries";
import { paymentFlags } from "@/services/billing";
import { formatAUD, formatNumericDate } from "@/lib/format";
import type { InvoiceStatus } from "@/mocks/types";

export const Route = createFileRoute("/invoices/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(invoiceListQuery),
  head: () => ({ meta: [{ title: "Family invoices — Opus" }, { name: "description", content: "Clarke Piano Studio term invoices, balances and payment status." }, { property: "og:title", content: "Family invoices — Opus" }, { property: "og:description", content: "Clarke Piano Studio term invoices, balances and payment status." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  errorComponent: () => <p role="alert">Invoices could not be opened. Please refresh to try again.</p>,
  component: Invoices,
});
function Invoices() {
  const { data } = useSuspenseQuery(invoiceListQuery);
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  const sum = (statuses: InvoiceStatus[]) => data.invoices.filter((invoice) => statuses.includes(invoice.status)).reduce((total, invoice) => total + (statuses.includes("paid") || statuses.includes("draft") ? invoice.totalCents : invoice.balanceCents ?? invoice.totalCents), 0);
  const shown = data.invoices.filter((invoice) => status === "all" || invoice.status === status);
  const flags = paymentFlags(data.invoices);
  const familyName = (id: string) => data.families.find((family) => family.id === id)?.displayName ?? "Family";
  return <div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-5"><h1 className="flex items-center gap-3 text-3xl font-semibold"><Receipt className="size-7 text-primary" aria-hidden /> Invoices</h1><div className="flex flex-wrap gap-3"><Button asChild variant="outline" className="max-w-full whitespace-normal"><Link to="/invoices/prepare"><FilePlus2 aria-hidden /> Prepare Term 2 invoices</Link></Button><Button asChild className="max-w-full whitespace-normal"><Link to="/invoices/renewals"><RefreshCw aria-hidden /> Renewal invitations & reminders</Link></Button></div></header>
    {flags.length > 0 && <section aria-label="Payments to chase" className="mt-7 rounded-lg border border-destructive/40 bg-destructive/5 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><CircleAlert className="size-6 text-destructive" aria-hidden /> Payments to chase</h2>
      <p className="mt-1 text-base text-muted-foreground">{flags.filter((flag) => flag.kind === "overdue").length} overdue · {flags.filter((flag) => flag.kind === "due_soon").length} due in the next 7 days</p>
      <div className="mt-4 divide-y divide-border border-y border-border">{flags.map((flag) => <Button key={flag.invoice.id} asChild variant="ghost" className="h-auto w-full justify-start whitespace-normal rounded-none px-1 py-4 text-left"><Link to="/invoices/$invoiceId" params={{ invoiceId: flag.invoice.id }}>
        <div className="grid min-w-0 flex-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div><p className="text-lg font-semibold">{familyName(flag.invoice.familyId)}</p><p className="mt-0.5 text-base font-normal text-muted-foreground">{flag.invoice.number} · Due {formatNumericDate(flag.invoice.dueDate)}</p></div>
          <Badge variant={flag.kind === "overdue" ? "destructive" : "secondary"} className="text-base">{flag.kind === "overdue" ? `${flag.days} day${flag.days === 1 ? "" : "s"} overdue` : flag.days === 0 ? "Due today" : `Due in ${flag.days} day${flag.days === 1 ? "" : "s"}`}</Badge>
          <span className="text-lg sm:text-right">{formatAUD(flag.invoice.balanceCents ?? flag.invoice.totalCents)}</span>
        </div><ArrowRight aria-hidden className="ml-3" />
      </Link></Button>)}</div>
    </section>}
    <section aria-label="Invoice totals" className="mt-7 grid grid-cols-2 gap-5 border-y border-border py-6 lg:grid-cols-4">
      {[{ name: "Draft total", value: sum(["draft"]) }, { name: "Sent total", value: sum(["sent", "partially_paid"]) }, { name: "Overdue total", value: sum(["overdue"]) }, { name: "Paid total", value: sum(["paid"]) }].map((total) => <div key={total.name}><p className="text-base text-muted-foreground">{total.name}</p><p className="mt-2 break-words font-display text-2xl font-semibold">{formatAUD(total.value)}</p></div>)}
    </section>
    <div className="my-6 flex flex-wrap gap-2" role="group" aria-label="Filter invoice status">{(["all", "draft", "sent", "overdue", "paid"] as const).map((filter) => <Button key={filter} variant={status === filter ? "secondary" : "ghost"} aria-pressed={status === filter} onClick={() => setStatus(filter)}>{filter === "all" ? "All" : INVOICE_STATUS[filter]}</Button>)}</div>
    <p className="mb-3 text-base text-muted-foreground">{shown.length} invoices · {formatAUD(shown.reduce((total, invoice) => total + invoice.totalCents, 0))}</p>
    <div className="divide-y divide-border border-y border-border">{shown.map((invoice) => <Button key={invoice.id} asChild variant="ghost" className="h-auto w-full justify-start whitespace-normal rounded-none px-1 py-5 text-left"><Link to="/invoices/$invoiceId" params={{ invoiceId: invoice.id }}>
      <div className="grid min-w-0 flex-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
        <div><p className="text-xl font-semibold">{data.families.find((family) => family.id === invoice.familyId)?.displayName}</p><p className="mt-1 text-base font-normal text-muted-foreground">{invoice.number} · Due {formatNumericDate(invoice.dueDate)}</p>{invoice.xeroSyncedAt && <Badge variant="secondary" className="mt-2 text-base">Sent to Xero</Badge>}</div>
        <span className={`text-base ${invoice.status === "overdue" ? "text-destructive" : invoice.status === "paid" ? "text-success" : "text-muted-foreground"}`}>{INVOICE_STATUS[invoice.status]}</span><span className="text-xl sm:text-right">{formatAUD(invoice.status === "partially_paid" ? invoice.balanceCents ?? invoice.totalCents : invoice.totalCents)}</span>
      </div><ArrowRight aria-hidden className="ml-3" />
    </Link></Button>)}</div>
    {shown.length === 0 && <p className="py-8 text-muted-foreground">No invoices with this status.</p>}
  </div>;
}