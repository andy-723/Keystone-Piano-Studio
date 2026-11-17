import { AUTHENTICATOR_APPS } from "@/lib/authenticator-apps";
import { plain, renderWelcomeEmail } from "./welcome-layout";

export type SignInLinkAudience = "staff" | "owner" | "family";

/**
 * "Your sign-in link" sent when Keystone staff or a teacher presses "Send sign-in link" for
 * someone whose first link expired or who can't find it. Same branded layout as the welcome
 * emails, so it reads as the same product and points to self-serve help.
 */
export function signInLinkEmail(input: {
  audience: SignInLinkAudience;
  name: string;
  signInUrl: string;
  loginUrl: string;
  studioName?: string | undefined;
  /** False until the person has signed in once; staff and owners then also set up two-step sign-in. */
  hasSignedIn: boolean;
}) {
  const appUrl = new URL(input.loginUrl).origin;
  const first = plain(input.name).split(/\s+/)[0] || "there";
  const studio = plain(input.studioName ?? "") || "your studio";
  const needsAuthenticator = input.audience !== "family" && !input.hasSignedIn;

  const intro =
    input.audience === "staff"
      ? "Here's a fresh link to sign in to the Keystone Music HQ team console."
      : input.audience === "owner"
        ? `Here's a fresh link to sign in to ${studio} on Keystone Music HQ.`
        : `Here's a fresh link to sign in to your family app for ${studio}.`;

  return renderWelcomeEmail({
    appUrl,
    title: "Your Keystone Music HQ sign-in link",
    preheader: "A fresh sign-in link. It works once and expires in about an hour.",
    greeting: `Hi ${first},`,
    intro: [
      intro,
      ...(needsAuthenticator
        ? [
            "Your first sign-in sets up two-step sign-in, so install an authenticator app on your phone before you tap the button.",
          ]
        : []),
    ],
    ...(needsAuthenticator
      ? {
          appDownloads: {
            heading: "Get an authenticator app (2 minutes)",
            apps: AUTHENTICATOR_APPS.map((app) => ({
              name: app.name,
              links: [
                { label: "iPhone: App Store", url: app.appStore },
                { label: "Android: Google Play", url: app.googlePlay },
              ],
            })),
          },
        }
      : {}),
    button: { label: "Sign in to Keystone", url: input.signInUrl },
    buttonNote: `This button works once and expires in about an hour. After that, sign in any time at [${input.loginUrl}](${input.loginUrl}) with this email address and we'll send you a new link. No password needed.`,
    sections: [
      {
        heading: "Need help?",
        items: [
          input.audience === "family"
            ? `Lessons, times or fees: message your teacher in the family app.`
            : `Most answers are in the [help centre](${appUrl}/help).`,
          `Trouble signing in: see the [help centre](${appUrl}/help), or send a [support request](${appUrl}/support).`,
        ],
      },
    ],
    footerReason:
      "You're getting this because someone asked Keystone Music HQ to send you a sign-in link.",
  });
}
