import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { stripeStatusQuery } from "@/lib/integration-queries";
import { ParentPayment } from "@/components/ParentPayment";
import { parentInvoicesQuery, parentSessionQuery } from "@/lib/parent-queries";
import { useParentLanguage, parentDate, parentInvoiceLine } from "@/i18n/parent";
import { getStudio } from "@/services/roster";
import { queryParentInvoice } from "@/services/parent";
import { queryOptions } from "@tanstack/react-query";
import { formatAUD, formatNumericDate } from "@/lib/format";
import { invoiceNumberLabel, paymentMethodLabel } from "@/lib/billing-queries";

export function ParentInvoices({ selected, select }: { selected: string | null; select: (id: string | null) => void }) {
  const { data: invoices } = useSuspenseQuery(parentInvoicesQuery);
  const { t, lang } = useParentLanguage();
  const { data: stripeStatus } = useSuspenseQuery(stripeStatusQuery);
  const { data: session } = useSuspenseQuery(parentSessionQuery);
  const { data: studio } = useSuspenseQuery(queryOptions({ queryKey: ["studio"], queryFn: getStudio }));
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryBody, setQueryBody] = useState("");
  const client = useQueryClient();
  const invoice = invoices.find((entry) => entry.id === selected);
  const statusLabel = (entry: (typeof invoices)[number]) => {
    if (entry.isOverdue) return t("overdue");
    return t(entry.status === "sent" ? "sentStatus" : entry.status);
  };
  const querying = useMutation({
    mutationFn: () => queryParentInvoice(invoice!.id, queryBody),
    onSuccess: async () => {
      setQueryOpen(false);
      setQueryBody("");
      await client.invalidateQueries({ queryKey: ["parent"] });
      toast.success(t("querySent"));
    },
    onError: () => toast.error(t("queryError")),
  });

  if (invoice) {
    return (
      <div>
        <Button variant="ghost" onClick={() => select(null)}>
          <ArrowLeft aria-hidden />
          {t("allInvoices")}
        </Button>
        <h1 className="mt-5 text-3xl font-semibold">{invoice.isTaxInvoice ? t("taxInvoice") : t("invoice")}</h1>
        <p className="mt-2 text-lg">{invoiceNumberLabel(invoice)}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
          <span>{statusLabel(invoice)}</span>
          {invoice.isOverdue && (
            <Badge variant="destructive" className="text-base">
              {t("overdue")}
            </Badge>
          )}
          {invoice.queriedAt && !invoice.queryResolvedAt && (
            <Badge variant="secondary" className="text-base">
              {t("queried")}
            </Badge>
          )}
        </p>
        {invoice.isTaxInvoice && studio.abn && <p className="mt-2 text-base">ABN {studio.abn}</p>}
        <p className="mt-3 text-base">
          {t("billTo")}: {t("family")} · {session.guardian.name}
        </p>
        <dl className="my-6 grid grid-cols-2 gap-3 border-y border-border py-5 text-base">
          <dt>{t("issued")}</dt>
          <dd>{formatNumericDate(invoice.issueDate)}</dd>
          <dt>{t("due")}</dt>
          <dd>{formatNumericDate(invoice.dueDate)}</dd>
        </dl>
        {invoice.lines.map((line, index) => (
          <div key={index} className="border-b border-border py-4">
            <p className="text-lg">{parentInvoiceLine(line.description, lang)}</p>
            <p className="mt-2 text-base text-muted-foreground">
              {line.qty} × {formatAUD(line.unitCents)}
            </p>
            <p className="mt-2 text-right text-xl font-semibold">{formatAUD(line.lineTotalCents)}</p>
          </div>
        ))}
        <dl className="my-6 grid grid-cols-2 gap-3">
          {invoice.isTaxInvoice && (
            <>
              <dt>{t("gstIncluded")}</dt>
              <dd className="text-right">{formatAUD(invoice.taxCents)}</dd>
            </>
          )}
          <dt className="text-xl font-semibold">{t("total")}</dt>
          <dd className="text-right text-xl font-semibold">{formatAUD(invoice.totalCents)}</dd>
          <dt>{t("amountPaid")}</dt>
          <dd className="text-right">{formatAUD(invoice.paidCents ?? 0)}</dd>
          <dt className="font-semibold">{t("balance")}</dt>
          <dd className="text-right font-semibold">{formatAUD(invoice.balanceCents ?? invoice.totalCents)}</dd>
        </dl>
        {invoice.status !== "paid" && <ParentPayment invoice={invoice} />}
        {invoice.status !== "paid" && invoice.status !== "void" && (
          <div className="mt-4">
            {!queryOpen ? (
              <Button variant="outline" className="w-full whitespace-normal" onClick={() => setQueryOpen(true)}>
                <MessageCircleQuestion aria-hidden />
                {t("questionInvoice")}
              </Button>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  querying.mutate();
                }}
              >
                <label className="block text-base font-semibold">
                  {t("questionInvoice")}
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-base"
                    value={queryBody}
                    onChange={(event) => setQueryBody(event.target.value)}
                    placeholder={t("questionPlaceholder")}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={querying.isPending}>
                    {querying.isPending ? t("sending") : t("send")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setQueryOpen(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
        {!!invoice.payments?.length && (
          <section className="mt-5 border-t border-border pt-4">
            <h2 className="text-xl font-semibold">{t("paymentHistory")}</h2>
            {invoice.payments.map((payment) => (
              <p key={payment.id} className="mt-2 text-base">
                {parentDate(payment.receivedOn ?? payment.date, lang)} · {paymentMethodLabel(payment.method)} ·{" "}
                {formatAUD(payment.amountCents)}
              </p>
            ))}
          </section>
        )}
        {stripeStatus === "connected" && (
          <>
            <p className="mt-6 text-base">{t("paymentMethods")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["PayTo", t("directDebit"), t("card")].map((method) => (
                <span key={method} className="border border-border px-3 py-2 text-base">
                  {method}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold">{t("invoices")}</h1>
      {invoices.length === 0 && <p className="mt-5">{t("noInvoices")}</p>}
      {invoices.map((entry) => (
        <Button
          key={entry.id}
          variant="ghost"
          onClick={() => select(entry.id)}
          className="mt-4 h-auto w-full justify-between whitespace-normal rounded-none border-b border-border px-0 py-5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-xl">{formatAUD(entry.totalCents)}</span>
            <span className="mt-1 block text-base font-normal">{invoiceNumberLabel(entry)}</span>
            <span className="mt-1 block text-base font-normal text-muted-foreground">
              {t("due")} {parentDate(entry.dueDate, lang)} · {statusLabel(entry)}
            </span>
          </span>
          <ArrowRight aria-hidden />
        </Button>
      ))}
    </div>
  );
}
