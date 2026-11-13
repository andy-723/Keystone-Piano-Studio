import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InvoicePaper } from "@/components/InvoicePaper";
import { invoiceListQuery } from "@/lib/billing-queries";
import { createInvoice, sendInvoice, gstFromInclusive } from "@/services/billing";
import { getBillingProfile } from "@/services/billing-profile";
import { stripeStatusQuery } from "@/lib/integration-queries";
import { queryOptions } from "@tanstack/react-query";
import { addDays } from "@/lib/calendar";
import type { Invoice, InvoiceLine } from "@/mocks/types";
import { studioToday } from "@/lib/studio-clock";

const billingProfileQuery = queryOptions({
  queryKey: ["billing-profile", "demo"],
  queryFn: () => getBillingProfile("demo"),
});

export const Route = createFileRoute("/invoices/new")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(invoiceListQuery),
      context.queryClient.ensureQueryData(billingProfileQuery),
      context.queryClient.ensureQueryData(stripeStatusQuery),
    ]),
  head: () => ({
    meta: [
      { title: "New invoice — Keystone Music HQ" },
      { name: "description", content: "Create a family invoice draft and send it." },
      { property: "og:title", content: "New invoice — Keystone Music HQ" },
      { property: "og:description", content: "Create a family invoice draft and send it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => <p role="alert">New invoice could not be opened. Please refresh to try again.</p>,
  component: NewInvoice,
});

type DraftLine = { description: string; qty: string; unitDollars: string };

function NewInvoice() {
  const { data } = useSuspenseQuery(invoiceListQuery);
  const { data: profile } = useSuspenseQuery(billingProfileQuery);
  const { data: stripeStatus } = useSuspenseQuery(stripeStatusQuery);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [familyId, setFamilyId] = useState(data.families[0]?.id ?? "");
  const [dueDate, setDueDate] = useState(addDays(studioToday(), 14));
  const [lines, setLines] = useState<DraftLine[]>([
    { description: "Piano lessons", qty: "1", unitDollars: "49" },
  ]);

  const builtLines: InvoiceLine[] = useMemo(
    () =>
      lines
        .map((line) => {
          const qty = Math.max(0, Math.round(Number(line.qty) || 0));
          const unitCents = Math.max(0, Math.round(Number(line.unitDollars) * 100) || 0);
          const lineTotalCents = qty * unitCents;
          const taxCents = data.studio.gstRegistered ? gstFromInclusive(lineTotalCents) : 0;
          return {
            description: line.description.trim() || "Lesson",
            qty,
            unitCents,
            lineTotalCents,
            taxCents,
            taxCode: "taxable" as const,
          };
        })
        .filter((line) => line.qty > 0 && line.unitCents > 0),
    [lines, data.studio.gstRegistered],
  );

  const preview: Invoice = useMemo(() => {
    const totalCents = builtLines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    const taxCents = data.studio.gstRegistered ? gstFromInclusive(totalCents) : 0;
    return {
      id: "preview",
      number: null,
      familyId,
      status: "draft",
      issueDate: studioToday(),
      dueDate,
      lines: builtLines,
      totalCents,
      subtotalCents: totalCents - taxCents,
      taxCents,
      isTaxInvoice: data.studio.gstRegistered,
      title: data.studio.gstRegistered ? "Tax invoice" : "Invoice",
      paidCents: 0,
      balanceCents: totalCents,
      snapshot: {
        seller: {
          legalName: profile.legalName || data.studio.name,
          tradingName: profile.tradingName || data.studio.name,
          ...(profile.abn ? { abn: profile.abn } : {}),
          ...(data.studio.address ? { address: data.studio.address } : {}),
        },
        buyer: {
          name: data.families.find((family) => family.id === familyId)?.displayName ?? "Family",
          email: data.families.find((family) => family.id === familyId)?.guardians[0]?.email ?? "",
        },
        payTo: { ...profile.payTo },
        lines: builtLines,
        totals: { subtotalCents: totalCents - taxCents, taxCents, totalCents },
        title: data.studio.gstRegistered ? "Tax invoice" : "Invoice",
        gstRegistered: data.studio.gstRegistered,
      },
    };
  }, [builtLines, data.families, data.studio, dueDate, familyId, profile]);

  const family = data.families.find((entry) => entry.id === familyId);

  const saving = useMutation({
    mutationFn: async (andSend: boolean) => {
      if (!familyId) throw new Error("Choose a family");
      if (!builtLines.length) throw new Error("Add at least one line");
      const draft = await createInvoice({ familyId, lines: builtLines, dueDate });
      if (andSend) {
        const sent = await sendInvoice(draft.id);
        return sent ?? draft;
      }
      return draft;
    },
    onSuccess: async (invoice, andSend) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["invoices"] }),
        client.invalidateQueries({ queryKey: ["invoice"] }),
        client.invalidateQueries({ queryKey: ["parent"] }),
      ]);
      toast.success(andSend ? "Invoice sent" : "Draft saved");
      void navigate({ to: "/invoices/$invoiceId", params: { invoiceId: invoice.id } });
    },
    onError: (error: Error) => toast.error(error.message || "Invoice could not be saved."),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost">
        <Link to="/invoices">
          <ArrowLeft aria-hidden /> All invoices
        </Link>
      </Button>
      <h1 className="mt-5 text-3xl font-semibold">New invoice</h1>
      <p className="mt-2 text-lg text-muted-foreground">Choose a family, add lines, then save or send.</p>

      <form
        className="mt-7 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          saving.mutate(false);
        }}
      >
        <label className="block text-lg font-semibold">
          Family
          <select
            className="mt-2 block min-h-14 w-full rounded-md border border-input bg-card px-3 text-lg"
            value={familyId}
            onChange={(event) => setFamilyId(event.target.value)}
          >
            {data.families.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-lg font-semibold">
          Due date
          <Input
            type="date"
            className="mt-2"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>

        <fieldset>
          <legend className="mb-3 text-lg font-semibold">Lines</legend>
          <div className="space-y-4">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-3 border-b border-border pb-4 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_auto]">
                <label className="text-base font-semibold">
                  Description
                  <Input
                    className="mt-2"
                    value={line.description}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, description: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </label>
                <label className="text-base font-semibold">
                  Qty
                  <Input
                    className="mt-2"
                    inputMode="numeric"
                    value={line.qty}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((entry, i) => (i === index ? { ...entry, qty: event.target.value } : entry)),
                      )
                    }
                  />
                </label>
                <label className="text-base font-semibold">
                  Rate (AUD)
                  <Input
                    className="mt-2"
                    inputMode="decimal"
                    value={line.unitDollars}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, unitDollars: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  className="self-end"
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  disabled={lines.length === 1}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => setLines((current) => [...current, { description: "", qty: "1", unitDollars: "" }])}
          >
            <Plus aria-hidden /> Add line
          </Button>
        </fieldset>

        <section aria-label="Preview">
          <h2 className="mb-4 text-2xl font-semibold">Preview</h2>
          <InvoicePaper
            invoice={preview}
            studio={data.studio}
            family={family}
            payTo={profile.payTo}
            stripeConnected={stripeStatus === "connected"}
            discount={data.studio.billing?.paymentDiscount}
          />
        </section>

        <footer className="flex flex-wrap gap-3 border-t border-border py-6">
          <Button type="submit" variant="outline" disabled={saving.isPending}>
            {saving.isPending ? "Saving…" : "Save draft"}
          </Button>
          <Button
            type="button"
            disabled={saving.isPending}
            onClick={() => saving.mutate(true)}
          >
            <Send aria-hidden />
            {saving.isPending ? "Sending…" : "Send"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
