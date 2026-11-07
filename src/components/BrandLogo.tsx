import stacked1x from "@/assets/brand/keystone-lockup-stacked-136@1x.png";
import stacked2x from "@/assets/brand/keystone-lockup-stacked-136@2x.png";
import stacked3x from "@/assets/brand/keystone-lockup-stacked-136@3x.png";
import horizontal1x from "@/assets/brand/keystone-lockup-horizontal-40@1x.png";
import horizontal2x from "@/assets/brand/keystone-lockup-horizontal-40@2x.png";
import horizontal3x from "@/assets/brand/keystone-lockup-horizontal-40@3x.png";
import tagline1x from "@/assets/brand/keystone-lockup-tagline-360@1x.png";
import tagline2x from "@/assets/brand/keystone-lockup-tagline-360@2x.png";
import tagline3x from "@/assets/brand/keystone-lockup-tagline-360@3x.png";
import mark1x from "@/assets/brand/keystone-mark-48@1x.png";
import mark2x from "@/assets/brand/keystone-mark-48@2x.png";
import mark3x from "@/assets/brand/keystone-mark-48@3x.png";

type BrandLogoVariant = "stacked" | "horizontal" | "tagline" | "mark";

const VARIANTS: Record<
  BrandLogoVariant,
  { src: string; srcSet: string; width: number; height: number; className: string }
> = {
  stacked: {
    src: stacked1x,
    srcSet: `${stacked1x} 1x, ${stacked2x} 2x, ${stacked3x} 3x`,
    width: 136,
    height: 171,
    className: "w-full max-w-[136px] h-auto shrink-0",
  },
  horizontal: {
    src: horizontal1x,
    srcSet: `${horizontal1x} 1x, ${horizontal2x} 2x, ${horizontal3x} 3x`,
    width: 158,
    height: 40,
    className: "h-10 w-auto shrink-0",
  },
  tagline: {
    src: tagline1x,
    srcSet: `${tagline1x} 1x, ${tagline2x} 2x, ${tagline3x} 3x`,
    width: 360,
    height: 102,
    className: "w-[360px] max-w-full h-auto shrink-0",
  },
  mark: {
    src: mark1x,
    srcSet: `${mark1x} 1x, ${mark2x} 2x, ${mark3x} 3x`,
    width: 55,
    height: 48,
    className: "size-12 shrink-0",
  },
};

export function BrandLogo({
  variant,
  alt = "Keystone Music HQ",
  className = "",
}: {
  variant: BrandLogoVariant;
  alt?: string;
  className?: string;
}) {
  const asset = VARIANTS[variant];
  return (
    <img
      src={asset.src}
      srcSet={asset.srcSet}
      width={asset.width}
      height={asset.height}
      alt={alt}
      decoding="async"
      className={`object-contain ${asset.className} ${className}`.trim()}
    />
  );
}
