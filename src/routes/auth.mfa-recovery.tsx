import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/mfa-recovery")({
  component: MfaRecoveryPage,
  head: () => ({ meta: [{ title: "Lost authenticator — Keystone Music HQ" }] }),
});

function MfaRecoveryPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F5EBD6] px-4 text-[#15100D]">
      <div className="w-full max-w-md rounded-[22px] border border-[#D9C79E] bg-[#FBF7EE] p-8">
        <h1 className="text-2xl font-semibold">Lost your authenticator?</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#5A4F43]">
          A Keystone platform admin can reset two-step sign-in for your account from the admin
          console. Contact your studio owner or Keystone support. Support never asks for your
          authenticator codes.
        </p>
        <p className="mt-6">
          <Link
            to="/login"
            search={{ next: undefined, reason: undefined }}
            className="font-medium text-[#604A19] underline-offset-2 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
