import { Badge } from "@/components/ui/badge";
import type { Family, Invoice, Studio, StudioPayTo } from "@/mocks/types";
import { formatAUD, formatNumericDate } from "@/lib/format";
import { formatBsb } from "@/services/billing-profile";
import {
  INVOICE_STATUS,
  invoiceDisplayStatus,
  invoiceNumberLabel,
  paymentMethodLabel,
} from "@/lib/billing-queries";

function formatPayToAccount(accountNumber?: string) {
  if (!accountNumber) return "";
  const digits = accountNumber.replace(/\D/g, "");
  return digits;
}

export function InvoicePaper({
  invoice,
  studio,
  family,
  payTo,
  stripeConnected = false,
  discount,
}: {
  invoice: Invoice;
  studio: Studio;
  family?: Family | undefined;
  payTo?: StudioPayTo | undefined;
  stripeConnected?: boolean;
  discount?: { enabled: boolean; method?: string; amount?: number } | undefined;
}) {
  const seller = invoice.snapshot?.seller;
  const buyer = invoice.snapshot?.buyer;
  const resolvedPayTo = invoice.snapshot?.payTo ?? payTo;
  const title = invoice.title ?? (invoice.isTaxInvoice ? "Tax invoice" : "Invoice");
  const numberLabel = invoiceNumberLabel(invoice);
  const statusLabel = invoiceDisplayStatus(invoice);
  const reference = invoice.number ?? "Draft (no number yet)";
  const showBank = Boolean(
    resolvedPayTo?.bsb || resolvedPayTo?.accountNumber || resolvedPayTo?.payId || resolvedPayTo?.accountName,
  );
  const discountOn = Boolean(discount?.enabled && discount.method && discount.amount != null);

  return (
    <article className="invoice-paper bg-card py-6 md:py-8" aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-primary pb-6">
        <div>
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-lg">{numberLabel}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
            <span>{statusLabel}</span>
            {invoice.isOverdue && (
              <Badge variant="destructive" className="text-base">
                {INVOICE_STATUS.overdue}
                {invoice.daysOverdue ? ` · ${invoice.daysOverdue}d` : ""}
              </Badge>
            )}
            {invoice.queriedAt && !invoice.queryResolvedAt && (
              <Badge variant="secondary" className="text-base">
                Queried
              </Badge>
            )}
          </p>
          {invoice.xeroSyncedAt && (
            <Badge variant="secondary" className="mt-2 text-base">
              Sent to Xero
            </Badge>
          )}
        </div>
        <div>
          <h2 className="text-xl font-semibold">{seller?.tradingName || seller?.legalName || studio.name}</h2>
          {invoice.isTaxInvoice && (seller?.abn || studio.abn) && (
            <p className="mt-2 text-base">ABN {seller?.abn ?? studio.abn}</p>
          )}
          {seller?.address && <p className="mt-1 text-base text-muted-foreground">{seller.address}</p>}
        </div>
      </header>

      <div className="grid gap-6 border-b border-border py-6 sm:grid-cols-2">
        <div>
          <p className="text-base text-muted-foreground">Bill to</p>
          <p className="mt-1 text-xl font-semibold">{buyer?.name ?? family?.displayName}</p>
          <p className="mt-1 text-base">
            {buyer?.email ?? family?.guardians.map((guardian) => guardian.name).join(", ")}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-base">
          <dt className="text-muted-foreground">Issued</dt>
          <dd>{formatNumericDate(invoice.issueDate)}</dd>
          <dt className="text-muted-foreground">Due</dt>
          <dd>{formatNumericDate(invoice.dueDate)}</dd>
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="font-semibold">{reference}</dd>
        </dl>
      </div>

      <div className="hidden grid-cols-[minmax(0,1fr)_4rem_6rem_7rem] gap-3 border-b border-border py-3 text-base font-semibold md:grid">
        <span>Lesson</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Amount</span>
      </div>
      {invoice.lines.map((line, index) => (
        <div key={index} className="grid gap-3 border-b border-border py-5 md:grid-cols-[minmax(0,1fr)_4rem_6rem_7rem]">
          <p className="break-words text-lg">{line.description}</p>
          <p className="text-base md:text-right">
            <span className="md:hidden">Lessons: </span>
            {line.qty}
          </p>
          <p className="text-base md:text-right">
            <span className="md:hidden">Rate: </span>
            {formatAUD(line.unitCents)}
          </p>
          <p className="text-lg font-semibold md:text-right">{formatAUD(line.lineTotalCents)}</p>
        </div>
      ))}

      <dl className="ml-auto mt-6 grid max-w-sm grid-cols-2 gap-x-5 gap-y-3">
        {invoice.isTaxInvoice && (
          <>
            <dt className="text-base text-muted-foreground">Subtotal</dt>
            <dd className="text-right text-base">{formatAUD(invoice.subtotalCents)}</dd>
            <dt className="text-base text-muted-foreground">GST included</dt>
            <dd className="text-right text-base">{formatAUD(invoice.taxCents)}</dd>
          </>
        )}
        <dt className="border-t border-border pt-3 text-xl font-semibold">Total</dt>
        <dd className="border-t border-border pt-3 text-right text-xl font-semibold">{formatAUD(invoice.totalCents)}</dd>
        <dt className="text-base text-muted-foreground">Amount paid</dt>
        <dd className="text-right text-base">{formatAUD(invoice.paidCents ?? 0)}</dd>
        <dt className="font-semibold">Balance</dt>
        <dd className="text-right font-semibold">{formatAUD(invoice.balanceCents ?? invoice.totalCents)}</dd>
      </dl>

      {discountOn && (
        <p className="mt-5 border-l-4 border-border pl-4 text-base">
          Payment-method discount: A${discount!.amount} off when paying by {discount!.method}. The full
          price is shown above.
        </p>
      )}

      {!!invoice.payments?.length && (
        <section className="mt-6 border-t border-border pt-4">
          <h2 className="text-xl font-semibold">Payment history</h2>
          {invoice.payments.map((payment) => (
            <p key={payment.id} className="mt-2 text-base">
              {formatNumericDate(payment.receivedOn ?? payment.date ?? invoice.issueDate)} ·{" "}
              {paymentMethodLabel(payment.method)} · {formatAUD(payment.amountCents)}
              {payment.xeroSyncedAt && (
                <Badge variant="secondary" className="ml-2 text-base">
                  Synced to Xero
                </Badge>
              )}
            </p>
          ))}
        </section>
      )}

      <footer className="mt-8 border-t border-border pt-5">
        {showBank && (
          <div className="space-y-2">
            <p className="text-base font-semibold">Pay to</p>
            {resolvedPayTo?.accountName && <p className="text-base">{resolvedPayTo.accountName}</p>}
            {resolvedPayTo?.bsb && (
              <p className="text-base">BSB {formatBsb(resolvedPayTo.bsb)}</p>
            )}
            {resolvedPayTo?.accountNumber && (
              <p className="text-base">Account {formatPayToAccount(resolvedPayTo.accountNumber)}</p>
            )}
            {resolvedPayTo?.payId && <p className="text-base">PayID {resolvedPayTo.payId}</p>}
            {resolvedPayTo?.cashNote && (
              <p className="text-base text-muted-foreground">{resolvedPayTo.cashNote}</p>
            )}
            <p role="note" className="mt-3 border-l-4 border-warning bg-warning-soft p-3 text-base">
              Use reference <span className="font-semibold">{reference}</span> so we can match your
              payment. Bank details can change — always check the latest invoice.
            </p>
          </div>
        )}
        {stripeConnected && invoice.status !== "paid" && invoice.status !== "void" && (
          <div className={showBank ? "mt-5" : undefined}>
            <p className="text-base font-semibold">Pay online</p>
            <p className="mt-2 text-base text-muted-foreground">
              PayTo, direct debit and card are available when your teacher has Stripe connected.
            </p>
          </div>
        )}
      </footer>
    </article>
  );
}
