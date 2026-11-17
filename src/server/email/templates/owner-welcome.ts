import { AUTHENTICATOR_APPS } from "@/lib/authenticator-apps";
import { plain, renderWelcomeEmail } from "./welcome-layout";

export type OwnerWelcomeAccess = {
  status: "pilot" | "comp" | "none";
  plan: "base" | "pro";
  /** YYYY-MM-DD, or null for no end date. */
  endsOn: string | null;
};

function formatDate(isoDate: string) {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function accessLine(access: OwnerWelcomeAccess | undefined): string {
  if (!access) return "";
  const plan =
    access.plan === "pro" ? "Pro plan (unlimited students)" : "Base plan (up to 30 students)";
  if (access.status === "pilot") {
    return `You're on a free pilot of the ${plan}${access.endsOn ? ` until ${formatDate(access.endsOn)}` : ""}. Nothing is charged during the pilot; we'll be in touch before it ends.`;
  }
  if (access.status === "comp") {
    return `You have complimentary access to the ${plan}${access.endsOn ? ` until ${formatDate(access.endsOn)}` : ""}.`;
  }
  return `Your studio opens once a subscription starts: Settings, then Plan and billing (Base A$29 or Pro A$49 a month).`;
}

/**
 * "Welcome to Keystone Music HQ" for a new studio owner, sent when Keystone creates the studio.
 * Written so the owner can set up without help: expectations, agreements, steps, help.
 */
export function ownerWelcomeEmail(input: {
  ownerName: string;
  studioName: string;
  signInUrl: string;
  appUrl?: string;
  supportEmail?: string;
  access?: OwnerWelcomeAccess;
}) {
  const appUrl = (input.appUrl ?? new URL(input.signInUrl).origin).replace(/\/$/, "");
  const supportEmail = input.supportEmail ?? "support@keystonemusichq.com";
  const studio = plain(input.studioName) || "your studio";
  const first = plain(input.ownerName).split(/\s+/)[0] || "there";
  const access = accessLine(input.access);
  return renderWelcomeEmail({
    appUrl,
    title: `Welcome to Keystone Music HQ, ${studio}`,
    preheader: "Your studio is ready. Here's how to set it up in about an hour.",
    greeting: `Hi ${first},`,
    intro: [
      `Welcome to Keystone Music HQ. ${studio} is ready for you. Keystone keeps your students, lessons, families, invoices and messages in one place, so you spend less time on admin.`,
      ...(access ? [access] : []),
      "You'll also get a separate sign-in email. Before you sign in, install an authenticator app on your phone, because your first sign-in sets up two-step sign-in.",
    ],
    appDownloads: {
      heading: "Before you sign in: get an authenticator app (2 minutes)",
      note: "Tap your phone's store below. Either app works, and so does 1Password if you already use it.",
      apps: AUTHENTICATOR_APPS.map((app) => ({
        name: app.name,
        links: [
          { label: "iPhone: App Store", url: app.appStore },
          { label: "Android: Google Play", url: app.googlePlay },
        ],
      })),
    },
    button: { label: "Sign in to Keystone", url: input.signInUrl },
    buttonNote: `Sign in with this email address. If the button doesn't work, open ${input.signInUrl}`,
    sections: [
      {
        heading: "Set up your studio (about an hour)",
        numbered: true,
        items: [
          "Sign in and set up two-step sign-in with your authenticator app.",
          "Settings: your name, photo and Working with Children Check.",
          "Settings, then Studio terms: your studio details, billing rules, cancellations and make-ups, privacy. Then publish your terms. Families can't open an invite until your terms are published.",
          "Settings: your bank details, so they print on every invoice.",
          "Students: enrol each student. Keystone emails the parent an invite to fill in the enrolment form and accept your terms.",
          "Calendar: add each student's weekly lesson. Then send invoices from Invoices.",
        ],
        paragraphs: [
          "The studio tour opens when you first sign in and walks you through each step. Press the ? button at the top to replay it any time.",
        ],
      },
      {
        heading: "What to expect",
        items: [
          "Families sign in to their own family app to see invoices, news and messages from you. Lesson and fee questions come to you in chat.",
          "Families pay you directly by bank transfer using the details on your invoices. Keystone never holds your money.",
          "Your studio's data is kept in Australia (Sydney), with an encrypted nightly backup in Melbourne.",
          "For security, Keystone signs you out after 30 minutes without activity, and after 8 hours. Keystone will never ask for your authenticator code.",
        ],
      },
      {
        heading: "Your agreements",
        paragraphs: [
          `Using Keystone Music HQ means you agree to our [Terms of use](${appUrl}/terms) and [Privacy notice](${appUrl}/privacy)${input.access?.status === "pilot" ? ", together with your pilot Order Form" : ""}. Your studio terms are your own agreement with your families; Keystone gives you a template, not legal advice.`,
        ],
      },
      {
        heading: "Getting help",
        items: [
          `Most answers are in the [help centre](${appUrl}/help).`,
          `Still stuck? Send a [support request](${appUrl}/support) from inside the app. You get a reference number by email, and urgent problems (can't sign in, privacy or data issues) are seen first.`,
          `Or email [${supportEmail}](mailto:${supportEmail}).`,
        ],
      },
    ],
    footerReason: `You're getting this because a Keystone Music HQ studio was created for this email address.`,
  });
}
