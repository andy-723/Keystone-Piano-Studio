import { createFileRoute } from "@tanstack/react-router";
import { PublicPage, publicSupportEmail } from "@/components/public/PublicPage";

export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Help — Keystone Music HQ" }] }),
  component: HelpPage,
});

function HelpPage() {
  const email = publicSupportEmail();
  return (
    <PublicPage title="Help with signing in">
      <h2 className="pt-2 text-2xl font-semibold">Ways to sign in</h2>
      <p>
        Use <strong>Continue with Google</strong> or <strong>Continue with Microsoft</strong> with
        the same email address your studio has on file, or enter that email and we&apos;ll send you
        a one-time sign-in link. Open the link on the same device.
      </p>
      <h2 className="pt-2 text-2xl font-semibold">Families and students</h2>
      <p>
        Families join from the invite email their teacher sends. If you can&apos;t sign in, check
        you&apos;re using the email address the invite was sent to, or ask your teacher to resend
        it.
      </p>
      <h2 className="pt-2 text-2xl font-semibold">Teachers and studio owners</h2>
      <p>
        Studio accounts use two-step sign-in. After signing in you&apos;ll be asked for the 6-digit
        code from your authenticator app. If you&apos;ve lost your authenticator, use a recovery
        code or contact us below.
      </p>
      <h2 className="pt-2 text-2xl font-semibold">Contact</h2>
      <p>
        Email{" "}
        <a className="text-[#604A19] underline" href={`mailto:${email}`}>
          {email}
        </a>
        . We never ask for your password or authenticator codes.
      </p>
    </PublicPage>
  );
}
