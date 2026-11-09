/** One colour reveal of the street scene (grey -> colour -> grey), matching street-scene.css. */
export const LOGIN_ANIM_DURATION_MS = 13_000;
/** Grey pause between reveals before the scene comes alive again. */
export const LOGIN_ANIM_HOLD_MS = 2_500;
/** Full loop length: reveal plus pause. */
export const LOGIN_ANIM_CYCLE_MS = LOGIN_ANIM_DURATION_MS + LOGIN_ANIM_HOLD_MS;
/** The floating notes are told to finish their current float this long before the reveal ends. */
export const LOGIN_ANIM_ENDING_LEAD_MS = 1_500;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
