/** Best-effort live Xero sync after sample ledger updates. No-ops without secrets or a live connection. */
export async function maybeSyncLiveXero(invoiceId: string) {
  try {
    const { syncInvoiceToLiveXeroFn } = await import("@/integrations/live");
    await syncInvoiceToLiveXeroFn({ data: { invoiceId } });
    // live.ts is a createServerFn stub; Node crypto stays in live-server via dynamic import
  } catch {
    /* sample mode, missing cookies, or server fn unavailable in unit tests */
  }
}
