export type IntegrationScope = "demo" | "new-studio";
export type StripeStatus = "not_connected" | "setting_up" | "connected";
export interface IntegrationState {
  stripe: {
    status: StripeStatus;
    businessName: string | null;
    bankLast4: string | null;
    /** Real studios only: true when this studio's own Stripe account is linked through Connect. */
    live?: boolean;
    /** Real studios only: false until Keystone's Stripe Connect keys are on the server. */
    configured?: boolean;
  };
  xero: {
    status: "not_connected" | "connected";
    organisationName: string | null;
    lastSyncedAt: string | null;
    /** Real studios only: the live Xero connection (src/server/xero.ts). */
    live?: {
      configured: boolean;
      needsReconnect: boolean;
      canConnect: boolean;
      lastError: string | null;
      salesAccountCode: string;
      paymentAccountCode: string | null;
      accounts?: {
        revenue: Array<{ code: string; name: string }>;
        bank: Array<{ code: string; name: string }>;
      };
    };
  };
}
export const initialIntegrations = (): IntegrationState => ({
  stripe: { status: "not_connected", businessName: null, bankLast4: null },
  xero: { status: "not_connected", organisationName: null, lastSyncedAt: null },
});
export const integrationState: Record<IntegrationScope, IntegrationState> = {
  demo: initialIntegrations(), "new-studio": initialIntegrations(),
};