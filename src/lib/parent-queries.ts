import { queryOptions } from "@tanstack/react-query";
import { getParentSession, getParentHome, getParentChat, getParentProgress, getParentInvoices } from "@/services/parent";
export const parentSessionQuery = queryOptions({ queryKey: ["parent", "session"], queryFn: getParentSession });
export const parentHomeQuery = queryOptions({ queryKey: ["parent", "home"], queryFn: getParentHome });
export const parentChatQuery = queryOptions({ queryKey: ["parent", "chat"], queryFn: getParentChat });
export const parentProgressQuery = queryOptions({ queryKey: ["parent", "progress"], queryFn: getParentProgress });
export const parentInvoicesQuery = queryOptions({ queryKey: ["parent", "invoices"], queryFn: getParentInvoices });