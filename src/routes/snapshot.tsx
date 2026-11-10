import { Suspense } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { StudioSnapshotPanel } from "@/components/snapshot/StudioSnapshotPanel";
import { canViewStudioSnapshot, useAppSettings } from "@/lib/app-settings";
import { studioSnapshotQuery } from "@/lib/snapshot-queries";
import type { SnapshotRangeKey } from "@/lib/snapshot-range";
import type { TaxLiteFyKey } from "@/lib/tax-lite-fy";
import { taxLitePackQuery, taxLiteStudentsQuery } from "@/lib/tax-lite-queries";

export const Route = createFileRoute("/snapshot")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { range?: SnapshotRangeKey; tax?: TaxLiteFyKey } => {
    const next: { range?: SnapshotRangeKey; tax?: TaxLiteFyKey } = {};
    if (search.range === "week" || search.range === "month") next.range = search.range;
    if (search.tax === "ytd" || search.tax === "fy") next.tax = search.tax;
    return next;
  },
  loaderDeps: ({ search }) => ({
    range: search.range ?? "week",
    tax: search.tax ?? "ytd",
  }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(studioSnapshotQuery(deps.range)),
      context.queryClient.ensureQueryData(taxLitePackQuery(deps.tax)),
      context.queryClient.ensureQueryData(taxLiteStudentsQuery()),
    ]),
  head: () => ({
    meta: [
      { title: "Studio snapshot — Keystone Music HQ" },
      {
        name: "description",
        content:
          "Studio snapshot and Tax Lite: revenue, overdue, pass-throughs, Stripe fees and home-studio hours.",
      },
      { property: "og:title", content: "Studio snapshot — Keystone Music HQ" },
      {
        property: "og:description",
        content:
          "Studio snapshot and Tax Lite: revenue, overdue, pass-throughs, Stripe fees and home-studio hours.",
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
  const { range: searchRange, tax: searchTax } = Route.useSearch();
  const navigate = Route.useNavigate();
  const range: SnapshotRangeKey = searchRange ?? "week";
  const taxFy: TaxLiteFyKey = searchTax ?? "ytd";

  if (!canViewStudioSnapshot(studioStaffRole)) {
    return (
      <div className="mx-auto max-w-2xl rounded-[2px] border border-[#D9C79E] bg-[#FBF7EE] px-5 py-8">
        <p className="text-base font-semibold uppercase tracking-[0.14em] text-[#604A19]">
          Keystone Music HQ
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[#15100D]">Studio snapshot</h1>
        <p className="mt-3 text-lg text-[#5A4F43]">
          Whole-studio money, Tax Lite figures and enrol numbers are for owners and admins. Teachers
          stay on Today for the day-book and their roll.
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
        taxFy={taxFy}
        onRangeChange={(next) => {
          void navigate({ search: (prev) => ({ ...prev, range: next }) });
        }}
        onTaxFyChange={(next) => {
          void navigate({ search: (prev) => ({ ...prev, tax: next }) });
        }}
      />
    </Suspense>
  );
}
