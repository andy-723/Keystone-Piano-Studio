import { useEffect, useRef, useState } from "react";
import { useLoginMusic } from "@/hooks/use-login-music";
import { useStreetAnimation } from "@/hooks/use-street-animation";
import "./street-scene.css";

/**
 * Nutcracker street-parade wallpaper (Andrew, 17 Nov 2026). The painting is sepia; a pre-made
 * red-and-gold version of it fades in over three spotlit groups during the 13 s reveal, the
 * same timing, classes (col c1-c3, note n0-n5, rays-glow) and loop as the old Art Deco SVG.
 * Images live in /public/login as WebP at three widths; the smallest that covers the screen
 * is picked on the client so phones download ~170 KB instead of ~540 KB.
 */
const SCENE_W = 2752;
const SCENE_H = 1536;
const WIDTHS = [1280, 1920, 2752] as const;

function pickWidth(box: { width: number; height: number }): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // The painting covers its box (full screen on desktop, a 340px band on phones), so it is
  // drawn at whichever is larger: box width, or box height stretched to the painting's ratio.
  const needed = Math.max(box.width, box.height * (SCENE_W / SCENE_H)) * dpr;
  return WIDTHS.find((w) => w >= needed * 0.85) ?? 2752;
}

/** Spotlit groups (painting pixels) that come to colour: pianist first, then crowd, then donkey. */
const SPOTS: Record<"c1" | "c2" | "c3", Array<[cx: number, cy: number, rx: number, ry: number]>> = {
  c1: [[2290, 1010, 470, 470]],
  c2: [
    [1170, 1110, 340, 380],
    [1660, 930, 380, 340],
    [2500, 760, 330, 260],
  ],
  c3: [
    [1745, 1150, 250, 400],
    [430, 990, 440, 360],
  ],
};

/** Floating notes rising from the piano: [x, y, scale]. */
const NOTES: Array<[number, number, number]> = [
  [2060, 820, 3.6],
  [2170, 730, 4.2],
  [2250, 860, 3.4],
  [2400, 690, 4],
  [1960, 760, 3.2],
  [2330, 590, 3.8],
];

function NutcrackerSvg() {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    setWidth(pickWidth(box ?? { width: window.innerWidth, height: window.innerHeight }));
  }, []);
  const base = width ? `/login/nutcracker-street-${width}.webp` : null;
  const colour = width ? `/login/nutcracker-street-colour-${width}.webp` : null;

  return (
    <svg
      ref={ref}
      className="scene-svg"
      viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
      preserveAspectRatio="xMaxYMid slice"
      role="img"
      aria-label="A Nutcracker street parade: toy soldiers, sugar plum fairy, mice, children and a donkey fill an old street while a nutcracker plays a grand piano. When the music starts, the pianist, the crowd and the donkey turn to colour, then the street settles back to sepia."
    >
      <defs>
        <radialGradient id="ks-feather">
          <stop offset="0.55" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <radialGradient id="ks-sky-glow">
          <stop offset="0" stopColor="#F2C46B" />
          <stop offset="1" stopColor="#F2C46B" stopOpacity="0" />
        </radialGradient>
        {(Object.keys(SPOTS) as Array<keyof typeof SPOTS>).map((k) => (
          <mask
            id={`ks-spot-${k}`}
            key={k}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={SCENE_W}
            height={SCENE_H}
          >
            {SPOTS[k].map(([cx, cy, rx, ry]) => (
              <ellipse
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                fill="url(#ks-feather)"
              />
            ))}
          </mask>
        ))}
      </defs>

      {base ? <image href={base} x="0" y="0" width={SCENE_W} height={SCENE_H} /> : null}

      <ellipse
        className="rays-glow"
        cx="1376"
        cy="230"
        rx="1500"
        ry="520"
        fill="url(#ks-sky-glow)"
      />

      {colour
        ? (Object.keys(SPOTS) as Array<keyof typeof SPOTS>).map((k) => (
            <g className={`col ${k}`} key={k}>
              <image
                href={colour}
                x="0"
                y="0"
                width={SCENE_W}
                height={SCENE_H}
                mask={`url(#ks-spot-${k})`}
              />
            </g>
          ))
        : null}

      {NOTES.map(([x, y, sc], i) => (
        <g key={i} transform={`translate(${x},${y}) scale(${sc})`}>
          <g className={`note n${i}`}>
            <ellipse cx="0" cy="0" rx="5" ry="3.6" transform="rotate(-20)" fill="#F4E2B8" />
            <polyline
              points="4.4,-1.5 4.4,-22 12,-17"
              stroke="#F4E2B8"
              strokeWidth="2"
              fill="none"
            />
          </g>
        </g>
      ))}
    </svg>
  );
}

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
        className={`scene absolute inset-0 bg-[#5A4E45] max-[860px]:relative max-[860px]:h-[340px] max-[860px]:overflow-hidden ${className}`}
      >
        <div className="scene-svg h-full w-full [&_svg]:block [&_svg]:h-full [&_svg]:w-full">
          <NutcrackerSvg />
        </div>
      </div>
      {music.supported ? (
        <button
          type="button"
          onClick={music.toggle}
          aria-pressed={music.wanted}
          aria-label={music.wanted ? "Mute Für Elise" : "Play Für Elise"}
          title={music.wanted ? "Mute music" : "Play music"}
          className="music-toggle absolute bottom-6 right-6 z-3 flex min-h-11 items-center gap-2 rounded-full border border-[rgba(251,247,238,0.6)] bg-[rgba(21,16,13,0.55)] px-4 text-sm font-medium text-[#FBF7EE] transition-[background-color,border-color,transform] duration-150 fine-hover:hover:border-[rgba(251,247,238,0.9)] fine-hover:hover:bg-[rgba(21,16,13,0.75)] fine-hover:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FBF7EE] max-[860px]:bottom-auto max-[860px]:left-auto max-[860px]:right-4 max-[860px]:top-[250px] max-[860px]:px-3"
        >
          <SpeakerIcon on={music.wanted} />
          {/* Icon only on narrow phones so the label never runs into the logo. */}
          <span className="max-[520px]:sr-only">{label}</span>
        </button>
      ) : null}
    </>
  );
}
