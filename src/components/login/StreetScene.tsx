import { useStreetAnimation } from "@/hooks/use-street-animation";
// Trusted static asset committed in this repo (extracted from docs/design/login-art-deco.html).
import streetSceneSvg from "./street-scene.svg?raw";
import "./street-scene.css";

export function StreetScene() {
  const { className, replay } = useStreetAnimation();

  return (
    <>
      <div
        className={`scene absolute inset-0 bg-[#2B241F] max-[860px]:relative max-[860px]:h-[340px] max-[860px]:overflow-hidden ${className}`}
      >
        <div
          className="scene-svg h-full w-full max-[860px]:absolute max-[860px]:left-0 max-[860px]:h-full max-[860px]:w-auto [&_svg]:h-full [&_svg]:w-full [&_svg]:block max-[860px]:[&_svg]:h-full max-[860px]:[&_svg]:w-auto"
          // Trusted static asset in the repo; not user-supplied HTML.
          dangerouslySetInnerHTML={{ __html: streetSceneSvg }}
        />
      </div>
      <button
        type="button"
        onClick={replay}
        className="replay absolute bottom-6 left-6 z-3 flex min-h-11 items-center gap-2 rounded-full border border-[rgba(251,247,238,0.6)] bg-[rgba(21,16,13,0.55)] px-4 text-sm font-medium text-[#FBF7EE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FBF7EE] max-[860px]:bottom-auto max-[860px]:left-auto max-[860px]:right-4 max-[860px]:top-7 max-[860px]:px-3"
      >
        Replay
      </button>
    </>
  );
}
