import { useLoginMusic } from "@/hooks/use-login-music";
import { useStreetAnimation } from "@/hooks/use-street-animation";
// Trusted static asset committed in this repo (extracted from docs/design/login-art-deco.html).
import streetSceneSvg from "./street-scene.svg?raw";
import "./street-scene.css";

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
      {on ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      ) : (
        <>
          <path d="m16 9 6 6" />
          <path d="m22 9-6 6" />
        </>
      )}
    </svg>
  );
}

export function StreetScene() {
  const { className } = useStreetAnimation();
  const music = useLoginMusic();

  // Music is on but the browser is still waiting for the visitor's first click, tap or key.
  const waiting = music.wanted && !music.audible;
  const label = !music.wanted ? "Music off" : waiting ? "Tap anywhere for music" : "Music on";

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
      {music.supported ? (
        <button
          type="button"
          onClick={music.toggle}
          aria-pressed={music.wanted}
          aria-label={music.wanted ? "Mute Für Elise" : "Play Für Elise"}
          title={music.wanted ? "Mute music" : "Play music"}
          className="music-toggle absolute bottom-6 left-6 z-3 flex min-h-11 items-center gap-2 rounded-full border border-[rgba(251,247,238,0.6)] bg-[rgba(21,16,13,0.55)] px-4 text-sm font-medium text-[#FBF7EE] transition-[background-color,border-color,transform] duration-150 fine-hover:hover:border-[rgba(251,247,238,0.9)] fine-hover:hover:bg-[rgba(21,16,13,0.75)] fine-hover:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FBF7EE] max-[860px]:bottom-auto max-[860px]:left-auto max-[860px]:right-4 max-[860px]:top-7 max-[860px]:px-3"
        >
          <SpeakerIcon on={music.wanted} />
          {/* Icon only on narrow phones so the label never runs into the logo. */}
          <span className="max-[520px]:sr-only">{label}</span>
        </button>
      ) : null}
    </>
  );
}
