import { Suspense } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { StudioSnapshotPanel } from "@/components/snapshot/StudioSnapshotPanel";
import { canViewStudioSnapshot, useAppSettings } from "@/lib/app-settings";
import { studioSnapshotQuery } from "@/lib/snapshot-queries";
import type { SnapshotRangeKey } from "@/lib/snapshot-range";

export const Route = createFileRoute("/snapshot")({
  validateSearch: (search: Record<string, unknown>): { range?: SnapshotRangeKey } =>
    search.range === "week" || search.range === "month" ? { range: search.range } : {},
  loaderDeps: ({ search }) => ({ range: search.range ?? "week" }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(studioSnapshotQuery(deps.range)),
  head: () => ({
    meta: [
      { title: "Studio snapshot — Keystone Music HQ" },
      {
        name: "description",
        content: "Studio snapshot: revenue, overdue, students, invites, practice and lessons.",
      },
      { property: "og:title", content: "Studio snapshot — Keystone Music HQ" },
      {
        property: "og:description",
        content: "Studio snapshot: revenue, overdue, students, invites, practice and lessons.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <p role="alert">Studio snapshot could not be opened. Please refresh to try again.</p>
  ),
  component: SnapshotPage,
});

function SnapshotPage() {
  const { studioStaffRole } = useAppSettings();
  const { range: searchRange } = Route.useSearch();
  const navigate = Route.useNavigate();
  const range: SnapshotRangeKey = searchRange ?? "week";

  if (!canViewStudioSnapshot(studioStaffRole)) {
    return (
      <div className="mx-auto max-w-2xl rounded-[2px] border border-[#D9C79E] bg-[#FBF7EE] px-5 py-8">
        <p className="text-base font-semibold uppercase tracking-[0.14em] text-[#604A19]">
          Keystone Music HQ
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[#15100D]">Studio snapshot</h1>
        <p className="mt-3 text-lg text-[#5A4F43]">
          Whole-studio money and enrol figures are for owners and admins. Teachers stay on Today for
          the day-book and their roll.
        </p>
        <p className="mt-6">
          <Link to="/" className="font-semibold text-[#604A19] underline-offset-2 hover:underline">
            Back to Today
          </Link>
        </p>
      </div>
    );
  }

  return (
    <Suspense fallback={<p className="text-[#5A4F43]">Opening studio snapshot…</p>}>
      <StudioSnapshotPanel
        range={range}
        onRangeChange={(next) => {
          void navigate({ search: { range: next } });
        }}
      />
    </Suspense>
  );
}
