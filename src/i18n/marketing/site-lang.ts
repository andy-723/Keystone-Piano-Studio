import { useEffect, useSyncExternalStore } from "react";
import { zhSite } from "./zh-CN";
import { viSite } from "./vi";
import { appDate, appPattern, appText } from "@/i18n/app";
import { tSetup } from "@/i18n/setup-wizard";

/**
 * Shared UI language for the public site and the signed-in app (studio, parent, admin, demo).
 * Marketing pages keep English on the server and first paint, then apply the saved choice after
 * mount via DOM translation. Signed-in screens that already use i18n (parent JSON, shell labels)
 * read the same store so one language control covers both.
 */
export type SiteLang = "en" | "zh-CN" | "vi";
export const SITE_LANGS: { value: SiteLang; label: string; short: string }[] = [
  { value: "en", label: "English", short: "EN" },
  { value: "zh-CN", label: "中文", short: "中文" },
  { value: "vi", label: "Tiếng Việt", short: "VI" },
];
export const SITE_LANG_STORAGE_KEY = "keystone.siteLang";
const KEY = SITE_LANG_STORAGE_KEY;
const DICTS: Record<Exclude<SiteLang, "en">, Record<string, string>> = {
  "zh-CN": zhSite,
  vi: viSite,
};

let current: SiteLang = "en";
const listeners = new Set<() => void>();
const isLang = (v: unknown): v is SiteLang => v === "en" || v === "zh-CN" || v === "vi";

/** Read the browser preference without changing the in-memory store. */
export function readStoredSiteLang(): SiteLang | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(KEY);
    return isLang(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** Apply localStorage (if any) to the in-memory store without notifying listeners. */
export function hydrateSiteLangFromStorage(): SiteLang {
  const saved = readStoredSiteLang();
  if (saved) current = saved;
  return current;
}

if (typeof window !== "undefined") hydrateSiteLangFromStorage();

export function getSiteLang(): SiteLang {
  return current;
}

export function setSiteLang(lang: SiteLang) {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

/**
 * Seed the shared preference when this browser has never chosen a language.
 * Used by the family portal to default to the guardian's preferred language.
 * Safe to call during render: updates the in-memory value without notifying listeners.
 */
export function ensureSiteLang(fallback: SiteLang): SiteLang {
  const saved = readStoredSiteLang();
  if (saved) {
    current = saved;
    return saved;
  }
  current = fallback;
  try {
    localStorage.setItem(KEY, fallback);
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

export function useSiteLang(): SiteLang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => "en",
  );
}

/** Translate one English string; unknown strings stay English. */
export function siteText(lang: SiteLang, english: string): string {
  if (lang === "en") return english;
  return DICTS[lang][english] ?? english;
}

/**
 * Whole-UI lookup used by the DOM translator: marketing copy first, then signed-in app copy
 * (`src/i18n/app/`), then the setup-wizard dictionary. Falls back to `{placeholder}` patterns
 * for strings with numbers, names or dates in them. Returns null when nothing matches.
 */
export function uiText(lang: SiteLang, english: string): string | null {
  if (lang === "en") return english;
  const direct = DICTS[lang][english] ?? appText(lang, english);
  if (direct != null) return direct;
  const wizard = tSetup(lang, english);
  if (wizard !== english) return wizard;
  const date = appDate(lang, english);
  if (date != null) return date;
  const pattern = appPattern(lang, english, (part) => {
    const exact = DICTS[lang][part] ?? appText(lang, part);
    if (exact != null) return exact;
    return appDate(lang, part) ?? tSetup(lang, part);
  });
  if (pattern != null) return pattern;
  // "Mon 12 Apr · Mon 19 Apr" or "All families · 22 families · Seen by 14 of 22 families"
  if (english.includes(" · ")) {
    const parts = english.split(" · ");
    const out = parts.map((part) => uiText(lang, part) ?? part);
    if (out.some((part, i) => part !== parts[i])) return out.join(" · ");
  }
  return null;
}

const ATTRS = ["aria-label", "alt", "placeholder", "title"] as const;
const origText = new WeakMap<Node, string>();
const lastText = new WeakMap<Node, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();
/** User content, form values and legal text are never translated. */
const SKIP_TEXT = "script,style,textarea,[contenteditable=true],[data-no-translate]";
/** Placeholders and labels on inputs are translated; only opted-out areas are skipped. */
const SKIP_ATTR = "script,style,[data-no-translate]";

function swap(value: string, lang: SiteLang) {
  const key = value.replace(/\s+/g, " ").trim();
  if (!key) return value;
  const out = uiText(lang, key);
  if (out == null || out === key) return value;
  const lead = value.match(/^\s*/)?.[0] ?? "";
  const trail = value.match(/\s*$/)?.[0] ?? "";
  return lead + out + trail;
}
function skip(el: Element | null, selector = SKIP_TEXT) {
  return !el || !!el.closest(selector);
}
function original(n: Text) {
  if (!origText.has(n) || n.nodeValue !== lastText.get(n)) origText.set(n, n.nodeValue ?? "");
  return origText.get(n) ?? "";
}
function write(n: Text, next: string) {
  lastText.set(n, next);
  if (n.nodeValue !== next) n.nodeValue = next;
}
/**
 * React renders `Lessons in Term {term}` as two text nodes. When every child of an element is a
 * text node, translate the joined sentence first (so word order can change), then fall back to
 * each piece on its own.
 */
function translateGroup(parent: Element, lang: SiteLang): boolean {
  const kids = parent.childNodes;
  if (kids.length < 2) return false;
  for (const k of kids) if (k.nodeType !== Node.TEXT_NODE) return false;
  const texts = [...kids] as Text[];
  const origs = texts.map(original);
  const joined = origs.join("");
  const key = joined.replace(/\s+/g, " ").trim();
  const out = key ? uiText(lang, key) : null;
  if (out == null || out === key) {
    texts.forEach((t, i) => write(t, swap(origs[i] ?? "", lang)));
    return true;
  }
  const lead = joined.match(/^\s*/)?.[0] ?? "";
  const trail = joined.match(/\s*$/)?.[0] ?? "";
  texts.forEach((t, i) => write(t, i === 0 ? lead + out + trail : ""));
  return true;
}
function translateText(n: Text, lang: SiteLang) {
  const parent = n.parentElement;
  if (skip(parent)) return;
  if (parent && translateGroup(parent, lang)) return;
  write(n, swap(original(n), lang));
}
function translateEl(el: Element, lang: SiteLang) {
  if (skip(el, SKIP_ATTR)) return;
  let store = origAttr.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v == null) continue;
    if (!store) {
      store = {};
      origAttr.set(el, store);
    }
    const prev = store[`__last_${a}`];
    if (store[a] === undefined || v !== prev) store[a] = v;
    const next = swap(store[a] ?? v, lang);
    store[`__last_${a}`] = next;
    if (v !== next) el.setAttribute(a, next);
  }
}
function walk(root: Node, lang: SiteLang) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root as Text, lang);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateEl(root as Element, lang);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n as Text, lang);
    else translateEl(n as Element, lang);
  }
}

/**
 * Mounted once at the app root: translates the public site and the signed-in app (studio,
 * family portal, admin, login, wizards) from English-keyed dictionaries after mount.
 * English stays the source of truth in code and on the server, so there is no hydration mismatch.
 */
export function useSiteTranslation() {
  const lang = useSiteLang();
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    const saved = readStoredSiteLang();
    const initial = isLang(fromUrl) ? fromUrl : (saved ?? "en");
    if (initial !== current) setSiteLang(initial);
  }, []);
  useEffect(() => {
    let busy = false;
    const run = (nodes: Iterable<Node>) => {
      if (busy) return;
      busy = true;
      // The Keystone admin console is staff-only and stays English.
      const effective = window.location.pathname.startsWith("/admin") ? "en" : lang;
      const htmlLang = effective === "en" ? "en-AU" : effective;
      if (document.documentElement.lang !== htmlLang) document.documentElement.lang = htmlLang;
      for (const n of nodes) walk(n, effective);
      busy = false;
    };
    run([document.body]);
    const obs = new MutationObserver((records) => {
      const nodes: Node[] = [];
      for (const r of records) {
        if (r.type === "childList") r.addedNodes.forEach((n) => nodes.push(n));
        else if (r.target) nodes.push(r.target);
      }
      run(nodes);
      obs.takeRecords();
    });
    obs.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });
    return () => {
      obs.disconnect();
      // Restore English when switching back so React's own text is shown again.
      if (lang !== "en") walk(document.body, "en");
      document.documentElement.lang = "en-AU";
    };
  }, [lang]);
}
