import { useEffect, useSyncExternalStore } from "react";
import { zhSite } from "./zh-CN";
import { viSite } from "./vi";

/**
 * Public website language (English, 中文, Tiếng Việt). Server and first client render are
 * always English; the saved choice is applied after mount by translating visible text in place
 * from English-keyed dictionaries. Anything inside [data-no-translate] (legal text, help
 * articles) is left alone.
 */
export type SiteLang = "en" | "zh-CN" | "vi";
export const SITE_LANGS: { value: SiteLang; label: string; short: string }[] = [
  { value: "en", label: "English", short: "EN" },
  { value: "zh-CN", label: "中文", short: "中文" },
  { value: "vi", label: "Tiếng Việt", short: "VI" },
];
const KEY = "keystone.siteLang";
const DICTS: Record<Exclude<SiteLang, "en">, Record<string, string>> = { "zh-CN": zhSite, vi: viSite };

let current: SiteLang = "en";
const listeners = new Set<() => void>();
const isLang = (v: unknown): v is SiteLang => v === "en" || v === "zh-CN" || v === "vi";

export function setSiteLang(lang: SiteLang) {
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}
export function useSiteLang(): SiteLang {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
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
    if (!store) { store = {}; origAttr.set(el, store); }
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
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    const initial = isLang(fromUrl) ? fromUrl : isLang(saved) ? saved : "en";
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
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    return () => {
      obs.disconnect();
      document.documentElement.lang = "en-AU";
    };
  }, [lang]);
}
