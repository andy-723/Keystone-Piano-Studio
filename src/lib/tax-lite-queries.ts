import { queryOptions } from "@tanstack/react-query";
import type { TaxLiteFyKey } from "@/lib/tax-lite-fy";
import {
  getTaxLitePack,
  listTaxLiteCategories,
  listTaxLitePassThroughStudents,
} from "@/services/tax-lite";

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
