import { Badge } from "@/components/ui/badge";
import type { Family, Invoice, Studio } from "@/mocks/types";
import { formatAUD, formatNumericDate } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/billing-queries";

export function InvoicePaper({ invoice, studio, family }: { invoice: Invoice; studio: Studio; family?: Family | undefined }) {
  return <article className="invoice-paper bg-card py-6 md:py-8" aria-label={invoice.title ?? (invoice.isTaxInvoice ? "Tax invoice" : "Invoice")}>
    <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-primary pb-6">
      <div><h1 className="text-3xl font-semibold">{invoice.title ?? (invoice.isTaxInvoice ? "Tax invoice" : "Invoice")}</h1><p className="mt-2 text-lg">{invoice.number}</p><p className="mt-2 text-base text-muted-foreground">{INVOICE_STATUS[invoice.status]}</p>{invoice.xeroSyncedAt && <Badge variant="secondary" className="mt-2 text-base">Sent to Xero</Badge>}</div>
      <div><h2 className="text-xl font-semibold">{studio.name}</h2>{invoice.isTaxInvoice && studio.abn && <p className="mt-2 text-base">ABN {studio.abn}</p>}</div>
    </header>
    <div className="grid gap-6 border-b border-border py-6 sm:grid-cols-2">
      <div><p className="text-base text-muted-foreground">Bill to</p><p className="mt-1 text-xl font-semibold">{family?.displayName}</p><p className="mt-1 text-base">{family?.guardians.map((guardian) => guardian.name).join(", ")}</p></div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-base"><dt className="text-muted-foreground">Issued</dt><dd>{formatNumericDate(invoice.issueDate)}</dd><dt className="text-muted-foreground">Due</dt><dd>{formatNumericDate(invoice.dueDate)}</dd></dl>
    </div>
    <div className="hidden grid-cols-[minmax(0,1fr)_4rem_6rem_7rem] gap-3 border-b border-border py-3 text-base font-semibold md:grid"><span>Lesson</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Amount</span></div>
    {invoice.lines.map((line, index) => <div key={index} className="grid gap-3 border-b border-border py-5 md:grid-cols-[minmax(0,1fr)_4rem_6rem_7rem]">
      <p className="break-words text-lg">{line.description}</p><p className="text-base md:text-right"><span className="md:hidden">Lessons: </span>{line.qty}</p><p className="text-base md:text-right"><span className="md:hidden">Rate: </span>{formatAUD(line.unitCents)}</p><p className="text-lg font-semibold md:text-right">{formatAUD(line.lineTotalCents)}</p>
    </div>)}
    <dl className="ml-auto mt-6 grid max-w-sm grid-cols-2 gap-x-5 gap-y-3">
      {invoice.isTaxInvoice && <><dt className="text-base text-muted-foreground">Subtotal</dt><dd className="text-right text-base">{formatAUD(invoice.subtotalCents)}</dd><dt className="text-base text-muted-foreground">GST included</dt><dd className="text-right text-base">{formatAUD(invoice.taxCents)}</dd></>}
      <dt className="border-t border-border pt-3 text-xl font-semibold">Total</dt><dd className="border-t border-border pt-3 text-right text-xl font-semibold">{formatAUD(invoice.totalCents)}</dd>
      <dt className="text-base text-muted-foreground">Amount paid</dt><dd className="text-right text-base">{formatAUD(invoice.paidCents ?? 0)}</dd>
      <dt className="font-semibold">Balance</dt><dd className="text-right font-semibold">{formatAUD(invoice.balanceCents ?? invoice.totalCents)}</dd>
    </dl>
    {!!invoice.payments?.length && <section className="mt-6 border-t border-border pt-4"><h2 className="text-xl font-semibold">Payment history</h2>{invoice.payments.map((payment) => <p key={payment.id} className="mt-2 text-base">{formatNumericDate(payment.date)} · {payment.method === "payto" ? "PayTo" : payment.method === "becs" ? "Direct debit" : "Card"} · {formatAUD(payment.amountCents)} {payment.xeroSyncedAt && <Badge variant="secondary" className="text-base">Synced to Xero</Badge>}</p>)}</section>}
    <footer className="mt-8 border-t border-border pt-5"><p className="text-base font-semibold">Payment methods</p><div className="mt-3 flex flex-wrap gap-3">{["PayTo", "Direct debit", "Card"].map((method) => <span key={method} className="border border-border bg-muted px-3 py-2 text-base">{method}</span>)}</div></footer>
  </article>;
}