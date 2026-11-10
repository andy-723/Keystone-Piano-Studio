import { queryOptions } from "@tanstack/react-query";
import type { SnapshotRangeKey } from "@/lib/snapshot-range";
import { getStudioSnapshot } from "@/services/snapshot";

export const studioSnapshotQuery = (range: SnapshotRangeKey) =>
  queryOptions({
    queryKey: ["studio-snapshot", range] as const,
    queryFn: () => getStudioSnapshot(range),
  });
