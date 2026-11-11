import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import en from "./en.json";
import zh from "./zh-CN.json";
import vi from "./vi.json";
const DICTS = { en, "zh-CN": zh, vi };
const LOCALES = { en: "en-AU", "zh-CN": "zh-CN", vi: "vi-VN" } as const;
import type { Lang } from "@/mocks/types";
import { useAppSettings } from "@/lib/app-settings";
export type ParentKey = keyof typeof en;
export function translate(lang: Lang, key: ParentKey, values: Record<string, string | number> = {}) {
  let text: string = DICTS[lang][key];
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
const Context = createContext<{ lang: Lang; setLang: (lang: Lang) => void } | null>(null);
export function ParentLanguageProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLang] = useState(initial);
  const { setParentLang } = useAppSettings();
  useEffect(() => { setParentLang(lang); }, [lang, setParentLang]);
  useEffect(() => { document.documentElement.lang = lang === "en" ? "en-AU" : lang; return () => { document.documentElement.lang = "en-AU"; }; }, [lang]);
  return <Context.Provider value={{ lang, setLang }}>{children}</Context.Provider>;
}
export function useParentLanguage() {
  const value = useContext(Context);
  if (!value) throw new Error("Parent language provider missing");
  return { ...value, t: (key: ParentKey, values?: Record<string, string | number>) => translate(value.lang, key, values) };
}
export function parentDate(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(LOCALES[lang], { timeZone: "Australia/Melbourne", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso.length === 10 ? `${iso}T12:00:00+11:00` : iso));
}

export function parentGrade(goal: string, lang: Lang) {
  const grade = goal.match(/Grade (\d+)/)?.[1];
  return grade ? translate(lang, "grade", { grade }) : translate(lang, "preliminary");
}
export function parentRequirement(title: string, lang: Lang) {
  if (lang === "en") return title;
  const scale = title.match(/^(.+) scale, hands together$/);
  const arpeggio = title.match(/^(.+) arpeggio$/);
  const piece = title.match(/^List ([ABC]) piece \((.+)\)$/);
  const sight = title.match(/^Sight-reading at (.+) level$/);
  if (scale?.[1]) return translate(lang, "scaleTitle", { key: scale[1].replace("major", lang === "vi" ? "trưởng" : "大调").replace("minor", lang === "vi" ? "thứ" : "小调") });
  if (arpeggio?.[1]) return translate(lang, "arpeggioTitle", { key: arpeggio[1].replace("major", lang === "vi" ? "trưởng" : "大调").replace("minor", lang === "vi" ? "thứ" : "小调") });
  if (piece?.[1] && piece[2]) return translate(lang, "pieceTitle", { list: piece[1], grade: parentGrade(piece[2], lang) });
  if (sight?.[1]) return translate(lang, "sightTitle", { grade: parentGrade(sight[1], lang) });
  if (title === "Extra list piece") return translate(lang, "extraPiece");
  if (title === "Clap back a rhythm") return translate(lang, "clapRhythm");
  if (title === "Sing back a short melody") return translate(lang, "singMelody");
  return title;
}
export function parentInvoiceLine(description: string, lang: Lang) {
  if (lang === "en") return description;
  const match = description.match(/^(.+?) [–-] (\d+) min lesson, Term ([12]) 2027$/);
  return match?.[1] && match[2] ? translate(lang, "invoiceLine", { student: match[1], duration: translate(lang, "duration", { minutes: match[2] }), term: translate(lang, match[3] === "2" ? "term2" : "term1") }) : description;
}