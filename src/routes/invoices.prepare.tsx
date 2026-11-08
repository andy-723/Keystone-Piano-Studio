import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { term2Query, term2DraftsQuery } from "@/lib/billing-queries";
import { sendTerm2Invoices } from "@/services/billing";
import { billNextTerm } from "@/services/billing-automation";
import { formatAUD, formatShortDate } from "@/lib/format";
import { renewalsQuery } from "@/lib/renewal-queries";

export const Route = createFileRoute("/invoices/prepare")({
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(term2Query), context.queryClient.ensureQueryData(term2DraftsQuery), context.queryClient.ensureQueryData(renewalsQuery)]),
  head: () => ({ meta: [{ title: "Bill next term — Keystone Music HQ" }, { name: "description", content: "Review Term 2 2027 piano lessons and prepare one invoice per family." }, { property: "og:title", content: "Bill next term — Keystone Music HQ" }, { property: "og:description", content: "Review Term 2 2027 piano lessons and prepare one invoice per family." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  errorComponent: () => <p role="alert">Term invoices could not be opened. Please refresh to try again.</p>, component: PrepareInvoices,
});
function PrepareInvoices() {
  const { data: preview } = useSuspenseQuery(term2Query);
  const { data: drafts } = useSuspenseQuery(term2DraftsQuery);
  const { data: renewals } = useSuspenseQuery(renewalsQuery);
  const eligibleRows = preview.rows.filter((row) => !renewals.active || renewals.rows.some((renewal) => renewal.familyId === row.student.familyId && renewal.status === "confirmed"));
  const [step, setStep] = useState(1);
  const [sent, setSent] = useState<number | null>(null);
  const client = useQueryClient();
  const preparing = useMutation({
    mutationFn: () => billNextTerm("demo"),
    onSuccess: async (result) => {
      if (!result.ran) {
        toast.error("Billing automation needs a Pro plan.");
        return;
      }
      await client.invalidateQueries({ queryKey: ["term2-drafts"] });
      setStep(2);
    },
    onError: () => toast.error("Drafts could not be prepared. Please try again."),
  });
  const sending = useMutation({ mutationFn: sendTerm2Invoices, onSuccess: async (invoices) => { setSent(invoices.length); await Promise.all([client.invalidateQueries({ queryKey: ["invoices"] }), client.invalidateQueries({ queryKey: ["term2-drafts"] }), client.invalidateQueries({ queryKey: ["parent"] }), client.invalidateQueries({ queryKey: ["integrations"] })]); }, onError: () => toast.error("Invoices could not be sent. Please try again.") });
  const total = drafts.invoices.reduce((amount, invoice) => amount + invoice.totalCents, 0);
  return <div className="mx-auto max-w-5xl">
    <Button asChild variant="ghost"><Link to="/invoices"><ArrowLeft aria-hidden /> All invoices</Link></Button>
    <h1 className="mt-5 text-3xl font-semibold">Bill next term</h1><p className="mt-2 text-lg">{formatShortDate(preview.term.start)} – {formatShortDate(preview.term.end)} 2027</p>
    <section className="mt-5 flex flex-wrap items-center justify-between gap-4 border-y border-border py-5" aria-label="Family renewal communications"><div><h2 className="text-xl font-semibold">Term 2 family renewals</h2><p className="mt-2 text-base text-muted-foreground">{renewals.active ? `${renewals.rows.filter((row) => row.status === "confirmed").length} confirmed · ${renewals.rows.filter((row) => row.status === "awaiting").length} awaiting reply` : "Invitations not sent"}</p></div><Button asChild variant="outline" className="max-w-full whitespace-normal"><Link to="/invoices/renewals"><MessageCircle aria-hidden /> Invitations & reminders</Link></Button></section>
    {renewals.active && <p className="mt-4 border-l-4 border-success pl-4 text-base">Confirmed renewals only · {renewals.rows.filter((row) => row.status === "confirmed").length} families</p>}
    <ol className="my-6 grid grid-cols-3 border-y border-border py-4" aria-label="Invoice steps">{["Lessons", "Drafts", "Review"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={`text-base ${step === index + 1 ? "font-semibold text-primary" : "text-muted-foreground"}`}>{index + 1}. {label}</li>)}</ol>
    {sent !== null ? <section className="py-8" role="status"><Check className="mb-4 size-10 text-success" aria-hidden /><h2 className="text-2xl font-semibold">{sent > 0 ? `${sent} invoices sent` : "Term 2 invoices are already prepared"}</h2><p className="mt-3 text-lg">{sent > 0 ? "Every family invoice is now marked Sent." : "No new drafts were created."}</p><Button asChild className="mt-6"><Link to="/invoices">View invoices <ArrowRight aria-hidden /></Link></Button></section> : <>
      {step === 1 && <section><h2 className="text-2xl font-semibold">Lessons in Term 2</h2><div className="my-4 border-l-4 border-warning bg-warning-soft p-4"><p className="font-semibold">Public holidays excluded</p>{preview.holidays.map(([date, name]) => <p key={date} className="mt-1 text-base">{formatShortDate(date)} · {name}</p>)}</div>
        <div className="divide-y divide-border">{eligibleRows.map((row) => <div key={row.student.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]"><div><p className="text-lg font-semibold">{row.student.firstName} {row.student.lastName}</p><p className="text-base text-muted-foreground">{row.lessonType?.name} · {row.skipped.length ? `${row.skipped.length} holidays skipped` : "No holidays in this lesson slot"}</p><details className="mt-2 text-base"><summary className="min-h-12 cursor-pointer py-2 text-primary">Lesson dates</summary><p className="text-muted-foreground">{row.dates.map(formatShortDate).join(" · ")}</p></details></div><p className="text-lg">{row.dates.length} lessons</p><p className="text-lg font-semibold sm:text-right">{formatAUD(row.totalCents)}</p></div>)}</div>
      </section>}
      {step === 2 && <section><h2 className="text-2xl font-semibold">Family drafts</h2><p className="mt-2 text-lg">{drafts.invoices.length} invoices · {formatAUD(total)}</p>{drafts.studio.gstRegistered && <p className="mt-2 text-base text-muted-foreground">ABN {drafts.studio.abn}</p>}
        <div className="mt-5 divide-y divide-border border-y border-border">{drafts.invoices.map((invoice) => <article key={invoice.id} className="py-6"><div className="flex flex-wrap justify-between gap-3"><h3 className="text-xl font-semibold">{drafts.families.find((family) => family.id === invoice.familyId)?.displayName}</h3><span className="text-base text-muted-foreground">{invoice.isTaxInvoice ? "Tax invoice" : "Invoice"} · Draft</span></div>
          {invoice.lines.map((line, index) => <div key={index} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><p className="text-base">{line.description}<span className="block text-muted-foreground">{line.qty} × {formatAUD(line.unitCents)}</span></p><p className="text-lg sm:text-right">{formatAUD(line.lineTotalCents)}</p></div>)}
          <div className="mt-4 flex flex-wrap justify-end gap-5">{invoice.isTaxInvoice && <p className="text-base text-muted-foreground">GST included {formatAUD(invoice.taxCents)}</p>}<p className="text-lg font-semibold">Total {formatAUD(invoice.totalCents)}</p></div>
        </article>)}</div>{drafts.invoices.length === 0 && <p className="py-6">Term 2 invoices have already been prepared.</p>}
      </section>}
      {step === 3 && <section className="py-4"><h2 className="text-2xl font-semibold">Ready to send</h2><dl className="mt-6 grid max-w-md grid-cols-2 gap-4 text-lg"><dt>Family invoices</dt><dd className="text-right">{drafts.invoices.length}</dd><dt>Total</dt><dd className="text-right font-semibold">{formatAUD(total)}</dd>{drafts.studio.gstRegistered && <><dt>GST included</dt><dd className="text-right">{formatAUD(drafts.invoices.reduce((amount, invoice) => amount + invoice.taxCents, 0))}</dd></>}</dl>
        <div className="mt-6 divide-y divide-border border-y border-border">{drafts.invoices.map((invoice) => <p key={invoice.id} className="flex flex-wrap justify-between gap-2 py-3 text-base"><span>{drafts.families.find((family) => family.id === invoice.familyId)?.displayName}</span><span>{formatAUD(invoice.totalCents)}</span></p>)}</div>
      </section>}
      <footer className="mt-7 flex flex-wrap justify-between gap-3 border-t border-border py-6">{step > 1 && <Button variant="outline" disabled={sending.isPending} onClick={() => setStep(step - 1)}><ArrowLeft aria-hidden /> Back</Button>}{step === 1 ? <Button className="ml-auto" disabled={preparing.isPending || eligibleRows.length === 0} onClick={() => preparing.mutate()}>{preparing.isPending ? "Preparing…" : "Prepare family drafts"}<ArrowRight aria-hidden /></Button> : step === 2 ? <Button className="ml-auto" disabled={drafts.invoices.length === 0} onClick={() => setStep(3)}>Review invoices <ArrowRight aria-hidden /></Button> : <Button className="ml-auto" disabled={sending.isPending || drafts.invoices.length === 0} onClick={() => sending.mutate()}><Send aria-hidden /> {sending.isPending ? "Sending…" : "Send all"}</Button>}</footer>
    </>}
  </div>;
}