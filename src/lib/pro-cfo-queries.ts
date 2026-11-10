import { queryOptions } from "@tanstack/react-query";
import { getProCfoPack } from "@/services/pro-cfo";

export function proCfoPackQuery() {
  return queryOptions({
    queryKey: ["pro-cfo"] as const,
    queryFn: () => getProCfoPack(),
  });
}
