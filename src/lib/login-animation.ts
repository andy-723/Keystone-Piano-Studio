export const LOGIN_ANIM_STORAGE_KEY = "ks-login-anim";
export const LOGIN_ANIM_DURATION_MS = 13_000;

export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function readAnimPlayedDate(): string | null {
  try {
    return localStorage.getItem(LOGIN_ANIM_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function markAnimPlayed(now = new Date()): void {
  try {
    localStorage.setItem(LOGIN_ANIM_STORAGE_KEY, todayKey(now));
  } catch {
    // ignore quota / private mode
  }
}

export function shouldAutoplayAnim(now = new Date()): boolean {
  return readAnimPlayedDate() !== todayKey(now);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
