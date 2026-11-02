import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { getStudio, setGstRegistered } from "@/services/roster";
import { toast } from "sonner";
const settingsQuery = queryOptions({ queryKey: ["studio-settings"], queryFn: getStudio });

export const Route = createFileRoute("/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
  head: () => ({
    meta: [
      { title: "Settings — Opus" },
      { name: "description", content: "Manage Clarke Piano Studio GST registration for family invoices." },
      { property: "og:title", content: "Settings — Opus" },
      { property: "og:description", content: "Manage Clarke Piano Studio GST registration for family invoices." },
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
  return <div className="mx-auto max-w-3xl"><h1 className="text-3xl font-semibold">Settings</h1><h2 className="mt-8 text-2xl font-semibold">{studio.name}</h2><div className="mt-6 flex items-center justify-between gap-5 border-y border-border py-6"><label htmlFor="registered-gst" className="flex min-h-12 flex-1 cursor-pointer items-center text-lg font-semibold">Registered for GST</label><Switch id="registered-gst" className="h-12 w-20 [&>span]:size-10 [&>span[data-state=checked]]:translate-x-8" checked={studio.gstRegistered} disabled={update.isPending} onCheckedChange={(value) => update.mutate(value)} /></div>{studio.gstRegistered && studio.abn && <p className="mt-5 text-base">ABN {studio.abn}</p>}</div>;
}
