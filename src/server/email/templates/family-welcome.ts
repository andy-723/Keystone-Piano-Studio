import { plain, renderWelcomeEmail } from "./welcome-layout";

/**
 * "Welcome to Keystone Music HQ" for a family, sent once they finish the enrolment form for a
 * real studio. Carries a one-time sign-in link, what to expect, a summary of what they agreed
 * to, and where to get help, so families rarely need to contact anyone to get going.
 */
export function familyWelcomeEmail(input: {
  studioName: string;
  guardianName: string;
  signInUrl: string;
  loginUrl: string;
  teacherName?: string;
  studentNames?: string[];
  studioTermsVersionNo?: number;
  acceptedOn?: string;
}) {
  const appUrl = new URL(input.loginUrl).origin;
  const studio = plain(input.studioName) || "your studio";
  const teacher = plain(input.teacherName ?? "") || studio;
  const first = plain(input.guardianName).split(/\s+/)[0] || "there";
  const kids = (input.studentNames ?? []).map(plain).filter(Boolean);
  const kidsLabel =
    kids.length === 0
      ? "your enrolment"
      : kids.length === 1
        ? `${kids[0]}'s enrolment`
        : `${kids.slice(0, -1).join(", ")} and ${kids.at(-1)}'s enrolment`;
  const version = input.studioTermsVersionNo ? ` (version ${input.studioTermsVersionNo})` : "";
  const on = input.acceptedOn ? ` on ${input.acceptedOn}` : "";

  return renderWelcomeEmail({
    appUrl,
    title: `Welcome to Keystone Music HQ, from ${studio}`,
    preheader: "You're enrolled. Sign in to your family app.",
    greeting: `Hi ${first},`,
    intro: [
      `Thanks for completing ${kidsLabel} with ${studio}. ${teacher} will be in touch about the first lesson.`,
      `${studio} uses Keystone Music HQ to run lessons, invoices and messages. Your family account is ready, so you can sign in now.`,
    ],
    button: { label: "Sign in to your family app", url: input.signInUrl },
    buttonNote: `This button works once and expires in about an hour. After that, sign in any time at [${input.loginUrl}](${input.loginUrl}) with this email address and we'll send you a fresh link. No password needed.`,
    sections: [
      {
        heading: "What you'll find in the family app",
        items: [
          "Messages: chat with your teacher. You get an email when there's something new.",
          "Invoices: every invoice and receipt, with the bank details to pay the studio.",
          "News from the studio, and your child's progress.",
          "English, 中文 or Tiếng Việt: switch language at the top of any page.",
        ],
        paragraphs: [
          "A short tour opens the first time you sign in and shows you around. Press the ? button at the top to replay it any time.",
        ],
      },
      {
        heading: "What to expect",
        items: [
          `${studio} runs the lessons and sets the fees. Questions about lessons, times or fees go to ${teacher} in Messages.`,
          "You pay the studio directly by bank transfer, using the details on each invoice. Keystone never asks for your bank or card details by email.",
          "Your family's information is kept in Australia (Sydney), with an encrypted nightly backup in Melbourne.",
          "For security, the app signs you out after 30 minutes without activity.",
        ],
      },
      {
        heading: "What you agreed to",
        items: [
          `${studio}'s studio terms${version}, accepted${on}. They cover lessons, billing, cancellations and make-ups.`,
          `Keystone Music HQ's [Terms of use](${appUrl}/terms) and [Privacy notice](${appUrl}/privacy).`,
          "Your consent choices for emergency medical care, health notes and photos. To change one, message your teacher.",
        ],
        paragraphs: [
          "A copy of the studio terms you accepted is kept with your enrolment. Ask your teacher if you'd like it sent to you.",
        ],
      },
      {
        heading: "Need help?",
        items: [
          `Lessons, times or fees: message ${teacher} in the family app.`,
          `Trouble signing in or using the app: see the [help centre](${appUrl}/help), or send a [support request](${appUrl}/support).`,
        ],
      },
    ],
    footerReason: `You're getting this because you completed an enrolment form for ${studio}.`,
  });
}
