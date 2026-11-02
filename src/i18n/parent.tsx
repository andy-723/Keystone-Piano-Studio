import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import en from "./en.json";
import zh from "./zh-CN.json";
import type { Lang } from "@/mocks/types";
export type ParentKey = keyof typeof en;
export function translate(lang: Lang, key: ParentKey, values: Record<string, string | number> = {}) {
  let text: string = (lang === "zh-CN" ? zh : en)[key];
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
const Context = createContext<{ lang: Lang; setLang: (lang: Lang) => void } | null>(null);
export function ParentLanguageProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLang] = useState(initial);
  useEffect(() => { document.documentElement.lang = lang === "zh-CN" ? "zh-CN" : "en-AU"; return () => { document.documentElement.lang = "en-AU"; }; }, [lang]);
  return <Context.Provider value={{ lang, setLang }}>{children}</Context.Provider>;
}
export function useParentLanguage() {
  const value = useContext(Context);
  if (!value) throw new Error("Parent language provider missing");
  return { ...value, t: (key: ParentKey, values?: Record<string, string | number>) => translate(value.lang, key, values) };
}
export function parentDate(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "zh-CN" ? "zh-CN" : "en-AU", { timeZone: "Australia/Melbourne", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso.length === 10 ? `${iso}T12:00:00+11:00` : iso));
}