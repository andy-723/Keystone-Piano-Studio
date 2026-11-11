import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BrandLogo } from "@/components/BrandLogo";
import { HomeLogoLink } from "@/components/HomeLogoLink";
import { getSupportEmailFn } from "@/server/platform";

export const Route = createFileRoute("/studio-enquiry")({
  loader: async () => getSupportEmailFn(),
  component: StudioEnquiryPage,
  head: () => ({ meta: [{ title: "Set up your studio — Keystone Music HQ" }] }),
});

function StudioEnquiryPage() {
  const { data } = useSuspenseQuery({
    queryKey: ["support-email"],
    queryFn: () => getSupportEmailFn(),
  });
  const email = data.email;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F5EBD6] px-4 text-[#15100D]">
      <div className="w-full max-w-lg rounded-[22px] border border-[#D9C79E] bg-[#FBF7EE] p-8">
        <HomeLogoLink>
          <BrandLogo variant="horizontal" alt="Keystone Music HQ" />
        </HomeLogoLink>
        <h1 className="mt-6 text-3xl font-semibold">Set up your studio</h1>
        <p className="mt-3 text-base leading-relaxed text-[#5A4F43]">
          Studio accounts on Keystone Music HQ are set up by the Keystone team. There is no
          self-sign-up yet. Email us and we will get your studio ready.
        </p>
        <p className="mt-4 text-base">
          <a
            href={`mailto:${email}`}
            className="font-medium text-[#604A19] underline-offset-2 hover:underline"
          >
            {email}
          </a>
        </p>
        <p className="mt-8">
          <Link to="/login" search={{ next: undefined }} className="text-[#604A19] underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
