import { useState } from "react";
import { Play } from "lucide-react";
import poster from "@/assets/keystone-teaching-moment.jpg";

/**
 * Founder intro + product walkthrough. Paste the finished video link here: YouTube, Vimeo or a
 * direct .mp4 file. Until it is set, the section shows the poster with a "coming soon" note.
 */
export const FOUNDER_VIDEO_URL = "";

function embedUrl(url: string): { kind: "iframe" | "video"; src: string } | null {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0` };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1` };
  return { kind: "video", src: url };
}

export function FounderVideo() {
  const [playing, setPlaying] = useState(false);
  const media = embedUrl(FOUNDER_VIDEO_URL);

  return (
    <section aria-labelledby="founder-video-title" className="bg-mk-ink">
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-6 md:px-10 md:pb-24 md:pt-8">
        <p className="flex items-center gap-3 text-base font-medium uppercase tracking-[0.18em] text-mk-gold">
          <span className="h-px w-10 bg-mk-gold" aria-hidden />
          Meet Keystone
        </p>
        <h2 id="founder-video-title" className="mt-4 font-mk-serif text-3xl font-semibold leading-tight text-mk-paper md:text-4xl">
          A walk through the studio, from the founder
        </h2>
        <p className="mt-3 max-w-2xl text-lg text-mk-paper/75">
          Hear why we built Keystone and see a real studio account in a few minutes. Press play, or keep scrolling.
        </p>

        <div className="relative mt-8 aspect-video overflow-hidden rounded-3xl border border-mk-gold/60 bg-mk-ink shadow-mk-lift">
          {playing && media ? (
            media.kind === "iframe" ? (
              <iframe
                src={media.src}
                title="Keystone Music HQ founder introduction"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 size-full"
              />
            ) : (
              <video src={media.src} controls autoPlay playsInline className="absolute inset-0 size-full bg-mk-ink" />
            )
          ) : (
            <>
              <img src={poster} alt="" className="absolute inset-0 size-full object-cover opacity-70" />
              <div className="absolute inset-0 bg-gradient-to-t from-mk-ink/80 via-mk-ink/30 to-transparent" aria-hidden />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  disabled={!media}
                  aria-label="Play the founder introduction video"
                  className="group flex size-20 items-center justify-center rounded-full border border-mk-gold bg-mk-paper/95 text-mk-bronze shadow-mk-lift transition-transform duration-300 hover:scale-105 disabled:cursor-default disabled:hover:scale-100 md:size-24"
                >
                  <Play className="ml-1 size-9 fill-current" aria-hidden />
                </button>
                <p className="text-lg font-medium text-mk-paper">
                  {media ? "Watch the introduction" : "Founder introduction · coming soon"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
