import { queryOptions } from "@tanstack/react-query";
import type { TaxLiteFyKey } from "@/lib/tax-lite-fy";
import {
  getTaxLitePack,
  listTaxLiteCategories,
  listTaxLitePassThroughStudents,
  listTaxLitePendingWeeks,
} from "@/services/tax-lite";

export function taxLitePendingWeeksQuery(fy: TaxLiteFyKey) {
  return queryOptions({
    queryKey: ["tax-lite", "pending-weeks", fy] as const,
    queryFn: () => listTaxLitePendingWeeks(fy),
  });
}

export function taxLitePackQuery(fy: TaxLiteFyKey) {
  return queryOptions({
    queryKey: ["tax-lite", fy] as const,
    queryFn: () => getTaxLitePack(fy),
  });
}

export function taxLiteStudentsQuery() {
  return queryOptions({
    queryKey: ["tax-lite", "students"] as const,
    queryFn: () => listTaxLitePassThroughStudents(),
  });
}

export function taxLiteCategoriesQuery() {
  return queryOptions({
    queryKey: ["tax-lite", "categories"] as const,
    queryFn: async () => [...listTaxLiteCategories()],
  });
}
