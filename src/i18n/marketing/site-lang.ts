import { useEffect, useSyncExternalStore } from "react";
import { zhSite } from "./zh-CN";
import { viSite } from "./vi";

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
const DICTS: Record<Exclude<SiteLang, "en">, Record<string, string>> = { "zh-CN": zhSite, vi: viSite };

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

const ATTRS = ["aria-label", "alt", "placeholder", "title"] as const;
const origText = new WeakMap<Node, string>();
const lastText = new WeakMap<Node, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();

function swap(value: string, lang: SiteLang) {
  const key = value.replace(/\s+/g, " ").trim();
  if (!key) return value;
  const out = siteText(lang, key);
  if (out === key) return value;
  const lead = value.match(/^\s*/)?.[0] ?? "";
  const trail = value.match(/\s*$/)?.[0] ?? "";
  return lead + out + trail;
}
function skip(el: Element | null) {
  return !el || !!el.closest("script,style,[data-no-translate]");
}
function translateText(n: Text, lang: SiteLang) {
  if (skip(n.parentElement)) return;
  if (!origText.has(n) || n.nodeValue !== lastText.get(n)) origText.set(n, n.nodeValue ?? "");
  const next = swap(origText.get(n) ?? "", lang);
  lastText.set(n, next);
  if (n.nodeValue !== next) n.nodeValue = next;
}
function translateEl(el: Element, lang: SiteLang) {
  if (skip(el)) return;
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

/** Mounted once per public page (by the marketing navbar). */
export function useSiteTranslation() {
  const lang = useSiteLang();
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    const saved = readStoredSiteLang();
    const initial = isLang(fromUrl) ? fromUrl : saved ?? "en";
    if (initial !== current) setSiteLang(initial);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en-AU" : lang;
    let busy = false;
    const run = (nodes: Iterable<Node>) => {
      if (busy) return;
      busy = true;
      for (const n of nodes) walk(n, lang);
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
      document.documentElement.lang = "en-AU";
    };
  }, [lang]);
}
