import { createFileRoute, Link } from "@tanstack/react-router";
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
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(settingsQuery), context.queryClient.ensureQueryData(integrationsQuery())]),
  head: () => ({
    meta: [
      { title: "Settings — Opus" },
      { name: "description", content: "Manage Clarke Piano Studio GST and mock Stripe payment and Xero accounting connections." },
      { property: "og:title", content: "Settings — Opus" },
      { property: "og:description", content: "Manage Clarke Piano Studio GST and mock Stripe payment and Xero accounting connections." },
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
}
