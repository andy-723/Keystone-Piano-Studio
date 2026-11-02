import { queryOptions } from "@tanstack/react-query";
import { getRenewals, getParentRenewal } from "@/services/renewals";
export const renewalsQuery = queryOptions({ queryKey: ["renewals"], queryFn: getRenewals });
export const parentRenewalQuery = queryOptions({ queryKey: ["parent", "renewal"], queryFn: getParentRenewal });