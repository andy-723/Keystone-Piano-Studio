import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Client-safe server function stubs.
 * Heavy Stripe/Xero/Node crypto code loads only inside handlers on the server.
 */

export const getLiveIntegrationsFn = createServerFn({ method: "GET" })
  .validator((input: { scope?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const { readPublicIntegrations } = await import("./live-server");
    return readPublicIntegrations(getRequest(), data.scope);
  });

export const disconnectLiveStripeFn = createServerFn({ method: "POST" })
  .validator((input: { scope?: string }) => input)
  .handler(async ({ data }) => {
    const { disconnectStripeLive } = await import("./live-server");
    return disconnectStripeLive(getRequest(), data.scope);
  });

export const disconnectLiveXeroFn = createServerFn({ method: "POST" })
  .validator((input: { scope?: string }) => input)
  .handler(async ({ data }) => {
    const { disconnectXeroLive } = await import("./live-server");
    return disconnectXeroLive(getRequest(), data.scope);
  });

export const createParentCheckoutFn = createServerFn({ method: "POST" })
  .validator((input: { invoiceId: string; cancelPath?: string }) => input)
  .handler(async ({ data }) => {
    const { createParentCheckoutLive } = await import("./live-server");
    return createParentCheckoutLive(getRequest(), data);
  });

export const syncInvoiceToLiveXeroFn = createServerFn({ method: "POST" })
  .validator((input: { invoiceId: string }) => input)
  .handler(async ({ data }) => {
    const { syncInvoiceToXeroLive } = await import("./live-server");
    return syncInvoiceToXeroLive(getRequest(), data.invoiceId);
  });
