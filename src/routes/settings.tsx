import { createFileRoute, Link } from "@tanstack/react-router";
import { PlanBilling } from "@/components/PlanBilling";
import { planBillingQuery } from "@/lib/plan-queries";
import { AssignmentSettings } from "@/components/Assignments";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { getStudio, setGstRegistered } from "@/services/roster";
import { toast } from "sonner";
import { Integrations } from "@/components/Integrations";
import { integrationsQuery } from "@/lib/integration-queries";
const settingsQuery = queryOptions({ queryKey: ["studio-settings"], queryFn: getStudio });

export const Route = createFileRoute("/settings")({
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(planBillingQuery()), context.queryClient.ensureQueryData(settingsQuery), context.queryClient.ensureQueryData(integrationsQuery())]),
  head: () => ({
    meta: [
      { title: "Settings — Opus" },
      { name: "description", content: "Manage Opus plans and simulated subscription billing, studio GST, payments and accounting connections." },
      { property: "og:title", content: "Settings — Opus" },
      { property: "og:description", content: "Manage Opus plans and simulated subscription billing, studio GST, payments and accounting connections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioSettings,
});

function StudioSettings() {
  const { data: studio } = useSuspenseQuery(settingsQuery);
  const client = useQueryClient();
  const update = useMutation({ mutationFn: setGstRegistered, onSuccess: async () => { await Promise.all(["studio-settings", "studio", "invoices", "invoice", "term2-drafts"].map((key) => client.invalidateQueries({ queryKey: [key] }))); toast.success("GST registration updated"); }, onError: () => toast.error("Setting could not be saved.") });
  return <div className="mx-auto max-w-3xl"><h1 className="text-3xl font-semibold">Settings</h1><PlanBilling/><h2 className="mt-8 text-2xl font-semibold">{studio.name}</h2><div className="mt-6 flex items-center justify-between gap-5 border-y border-border py-6"><label htmlFor="registered-gst" className="flex min-h-12 flex-1 items-center font-semibold">Registered for GST</label><Switch id="registered-gst" checked={studio.gstRegistered} disabled={update.isPending} onCheckedChange={value=>update.mutate(value)} /></div><AssignmentSettings/><section className="border-b border-border py-6"><h2 className="text-2xl font-semibold">Library</h2><Button asChild variant="outline" className="mt-4"><Link to="/library"><BookOpen aria-hidden/>Open library</Link></Button></section><Integrations studioName={studio.name}/></div>;
}