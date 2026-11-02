import { queryOptions } from "@tanstack/react-query";
import { getSetup } from "@/services/setup";
export const setupQuery = queryOptions({ queryKey: ["new-studio", "setup"], queryFn: getSetup });