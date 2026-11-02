import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InvoicePaper } from "@/components/InvoicePaper";
import { invoiceDetailQuery } from "@/lib/billing-queries";
import { setInvoiceStatus } from "@/services/billing";

export const Route = createFileRoute("/invoices/$invoiceId")({
  loader: async ({ context, params }) => { if (!await context.queryClient.ensureQueryData(invoiceDetailQuery(params.invoiceId))) throw notFound(); },
  head: () => ({ meta: [{ title: "Invoice detail — Opus" }, { name: "description", content: "Printable piano lesson invoice, payment methods and paid status." }, { property: "og:title", content: "Invoice detail — Opus" }, { property: "og:description", content: "Printable piano lesson invoice, payment methods and paid status." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  notFoundComponent: () => <p>Invoice not found.</p>, errorComponent: () => <p role="alert">Invoice could not be opened. Please refresh to try again.</p>, component: InvoiceDetail,
});
function InvoiceDetail() {
  const { invoiceId } = Route.useParams();
  const { data } = useSuspenseQuery(invoiceDetailQuery(invoiceId));
  const client = useQueryClient();
  const marking = useMutation({ mutationFn: () => setInvoiceStatus(invoiceId, "paid"), onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["invoice", invoiceId] }), client.invalidateQueries({ queryKey: ["invoices"] }), client.invalidateQueries({ queryKey: ["integrations"] }), client.invalidateQueries({ queryKey: ["parent"] })]); toast.success("Invoice marked as paid"); }, onError: () => toast.error("Invoice could not be updated.") });
  if (!data) return null;
  return <div className="mx-auto max-w-4xl">
    <div className="invoice-actions mb-5 flex flex-wrap items-center gap-3"><Button asChild variant="ghost"><Link to="/invoices"><ArrowLeft aria-hidden /> All invoices</Link></Button><Button variant="outline" onClick={() => window.print()}><Printer aria-hidden /> Print</Button>
      {data.invoice.status !== "paid" && data.invoice.status !== "void" && <Button className="w-full sm:ml-auto sm:w-auto" disabled={marking.isPending} onClick={() => marking.mutate()}><Check aria-hidden /> {marking.isPending ? "Saving…" : "Mark as paid"}</Button>}</div>
    <InvoicePaper invoice={data.invoice} studio={data.studio} family={data.family} />
  </div>;
}