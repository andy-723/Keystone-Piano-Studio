import { queryOptions } from "@tanstack/react-query";
import { getRenewals, getParentRenewal, getParentRenewals } from "@/services/renewals";
export const renewalsQuery = queryOptions({ queryKey: ["renewals"], queryFn: () => getRenewals() });
export const parentRenewalQuery = queryOptions({ queryKey: ["parent", "renewal"], queryFn: () => getParentRenewal() });
import type { RenewalTerm } from "@/mocks/renewals";
export const termRenewalsQuery = (term: RenewalTerm) => queryOptions({ queryKey: ["renewals", term], queryFn: () => getRenewals(term) });
export const parentRenewalsQuery = queryOptions({ queryKey: ["parent", "renewals"], queryFn: getParentRenewals });
