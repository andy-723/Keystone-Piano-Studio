export type IntegrationScope = "demo" | "new-studio";
export type StripeStatus = "not_connected" | "setting_up" | "connected";
export interface IntegrationState {
  stripe: { status: StripeStatus; businessName: string | null; bankLast4: string | null };
  xero: { status: "not_connected" | "connected"; organisationName: string | null; lastSyncedAt: string | null };
}
export const initialIntegrations = (): IntegrationState => ({
  stripe: { status: "not_connected", businessName: null, bankLast4: null },
  xero: { status: "not_connected", organisationName: null, lastSyncedAt: null },
});
export const integrationState: Record<IntegrationScope, IntegrationState> = {
  demo: initialIntegrations(), "new-studio": initialIntegrations(),
};