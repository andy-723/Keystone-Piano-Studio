/**
 * Authenticator apps we point studio staff to for two-step sign-in, with their official store
 * pages. Used by the owner welcome email and the two-step sign-in setup page, so both always
 * show the same apps and links.
 */
export type AuthenticatorApp = {
  name: string;
  appStore: string;
  googlePlay: string;
};

export const AUTHENTICATOR_APPS: AuthenticatorApp[] = [
  {
    name: "Google Authenticator",
    appStore: "https://apps.apple.com/app/google-authenticator/id388497605",
    googlePlay:
      "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2",
  },
  {
    name: "Microsoft Authenticator",
    appStore: "https://apps.apple.com/app/microsoft-authenticator/id983156458",
    googlePlay: "https://play.google.com/store/apps/details?id=com.azure.authenticator",
  },
];
