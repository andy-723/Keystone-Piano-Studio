import logoMark from "@/assets/keystone-mark.png";
import logoLockup from "@/assets/keystone-logo-720.png";
import { cn } from "@/lib/utils";

/** Cream mat behind the lockup/mark so piano-key lines stay readable. */
export const LOGO_CREAM = "#f5f1e6";

/** Intrinsic PNG size (512) — well above 3× the largest display size (64px). */
const MARK_SRC_SIZE = 512;
/** Display sizes — assets are 2×–3× these so object-fit never upscales mush. */
const MARK_DISPLAY = { sm: 40, md: 56, lg: 64 } as const;

type MarkSize = keyof typeof MARK_DISPLAY;

/** Piano-key mark only — use in rails/drawers; do not pair with a full wordmark. */
export function BrandMark({
  size = "md",
  className,
  alt = "",
}: {
  size?: MarkSize;
  className?: string;
  /** Empty when adjacent text already names the product. */
  alt?: string;
}) {
  const px = MARK_DISPLAY[size];
  return (
    <img
      src={logoMark}
      alt={alt}
      width={MARK_SRC_SIZE}
      height={MARK_SRC_SIZE}
      decoding="async"
      className={cn("shrink-0 rounded-md object-contain", className)}
      style={{
        backgroundColor: LOGO_CREAM,
        width: px,
        height: px,
      }}
    />
  );
}

/** Full Keystone Music HQ lockup — one brand treatment; never stack product-name text beside it. */
export function BrandLockup({
  className,
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src={logoLockup}
      alt="Keystone Music HQ"
      width={720}
      height={273}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : undefined}
      className={cn(
        "block h-10 w-auto max-w-[min(100%,14rem)] shrink-0 rounded-md object-contain object-left sm:h-12 sm:max-w-[17rem] lg:h-14 lg:max-w-[20rem]",
        className,
      )}
      style={{ backgroundColor: LOGO_CREAM }}
    />
  );
}
