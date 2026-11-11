import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, ArrowUp, Mail, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const highlights = ["More time teaching", "A clear studio week", "Family conversations", "Student care", "Keystone Music HQ"];

/** A clipped curtain reveal, with a normal-flow fallback on touch-sized screens. */
export function CinematicFooter() {
  const wrapper = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const { scrollYProgress } = useScroll({ target: wrapper, offset: ["start end", "end end"] });
  const y = useTransform(scrollYProgress, [0, 1], [70, 0]);

  return (
    <div ref={wrapper} className="mk-cinematic-curtain">
      <footer className="mk-cinematic-footer" aria-labelledby="keystone-footer-title">
        <motion.div aria-hidden className="mk-footer-wordmark" style={reducedMotion ? {} : { y }}>KEYSTONE</motion.div>
        <div className="mk-footer-marquee-band">
          <div className="mk-footer-marquee-window" aria-hidden>
            <div className="mk-footer-marquee" data-paused={paused || Boolean(reducedMotion)}>
              {[0, 1].map((copy) => <div className="mk-footer-marquee-copy" key={copy}>{highlights.map((text) => <span key={text}>{text}<span className="text-mk-bronze" aria-hidden>✦</span></span>)}</div>)}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-mk-ink hover:bg-mk-cream" aria-label={paused ? "Play scrolling highlights" : "Pause scrolling highlights"} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? <Play /> : <Pause />}</Button>
        </div>
        <div className="mk-footer-centre">
          <p className="text-lg text-mk-bronze">Keystone Music HQ</p>
          <h2 id="keystone-footer-title" className="mt-5 font-mk-serif text-4xl font-semibold leading-tight md:text-6xl">Bring your studio<br /><em className="font-normal">to Keystone.</em></h2>
          <p className="mx-auto mt-6 max-w-xl text-xl leading-relaxed text-mk-ink/75">Keystone is invite-only. Tell us about your studio and we’ll set you up personally.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="mk-footer-magnetic bg-mk-bronze text-mk-paper shadow-none hover:bg-mk-ink"><a href="mailto:support@keystonemusichq.com?subject=Request%20a%20studio">Request a studio <ArrowRight aria-hidden /></a></Button>
            <Button asChild variant="outline" size="lg" className="mk-footer-magnetic border-mk-gold/60 bg-mk-paper text-mk-ink hover:bg-mk-cream"><a href="https://keystonemusichq.com/login">Sign in <ArrowRight aria-hidden /></a></Button>
          </div>
          <nav aria-label="Footer links" className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild variant="ghost" className="text-mk-bronze hover:bg-mk-cream"><Link to="/pricing">Base &amp; Pro pricing</Link></Button>
            <Button asChild variant="ghost" className="text-mk-bronze hover:bg-mk-cream"><a href="mailto:support@keystonemusichq.com"><Mail aria-hidden /> Help</a></Button>
          </nav>
        </div>
        <div className="mk-footer-bottom">
          <div className="text-base text-mk-ink/70"><p>© 2026 Synoratech Pty Ltd · Keystone Music HQ</p><p className="mt-2">Marketing preview · no live payments or tax filing</p></div>
          <Button variant="outline" size="icon" className="shrink-0 rounded-full border-mk-gold/60 bg-mk-paper text-mk-ink hover:bg-mk-cream" aria-label="Back to top" title="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" })}><ArrowUp aria-hidden /></Button>
        </div>
      </footer>
    </div>
  );
}