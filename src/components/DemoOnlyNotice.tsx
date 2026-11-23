import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown to a real studio that opens a screen which still runs on demo data (for example by an
 * old link). The demo studio keeps the full screen.
 */
export function DemoOnlyNotice({
  title,
  back,
}: {
  title: string;
  back: { to: "/invoices"; label: string };
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost">
        <Link to={back.to}>
          <ArrowLeft aria-hidden /> {back.label}
        </Link>
      </Button>
      <h1 className="mt-5 text-3xl font-semibold">{title}</h1>
      <p className="mt-4 text-lg">
        This isn't available for your studio yet. We'll let you know when it is.
      </p>
    </div>
  );
}
