export type IntegrationScope = "demo" | "new-studio";
export type StripeStatus = "not_connected" | "setting_up" | "connected";

export interface StripeConnection {
  status: StripeStatus;
  businessName: string | null;
  bankLast4: string | null;
  /** Present only for live Stripe Connect accounts. Never send to the browser. */
  accountId?: string | null;
  accessToken?: string | null;
  livemode?: boolean;
}

export interface XeroConnection {
  status: "not_connected" | "connected";
  organisationName: string | null;
  lastSyncedAt: string | null;
  /** Live Xero OAuth fields. Never send to the browser. */
  tenantId?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
}

export interface IntegrationState {
  stripe: StripeConnection;
  xero: XeroConnection;
}

export const initialIntegrations = (): IntegrationState => ({
  stripe: { status: "not_connected", businessName: null, bankLast4: null, accountId: null, accessToken: null, livemode: false },
  xero: {
    status: "not_connected",
    organisationName: null,
    lastSyncedAt: null,
    tenantId: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  },
});

export const integrationState: Record<IntegrationScope, IntegrationState> = {
  demo: initialIntegrations(),
  "new-studio": initialIntegrations(),
};

export function publicIntegrations(state: IntegrationState) {
  return {
    stripe: {
      status: state.stripe.status,
      businessName: state.stripe.businessName,
      bankLast4: state.stripe.bankLast4,
    },
    xero: {
      status: state.xero.status,
      organisationName: state.xero.organisationName,
      lastSyncedAt: state.xero.lastSyncedAt,
    },
  };
}
