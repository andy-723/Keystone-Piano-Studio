import type { Lang } from "@/mocks/types";
import { shellStrings } from "./shell";
import { studioStrings } from "./studio";
import { studentStrings } from "./students";
import { billingStrings } from "./billing";
import { coursesStrings } from "./courses";
import { snapshotStrings } from "./snapshot";
import { settingsStrings } from "./settings";
import { familyStrings } from "./family";
import { tourStrings } from "./tour";
import { benchmarkStrings } from "./benchmarks";
import { extraStrings } from "./extra";
import { assignmentStrings } from "./assignments";
import { termBillingStrings } from "./term-billing";

/**
 * Signed-in app copy (studio, family portal, admin, sign-in, wizards) for the DOM translator in
 * `src/i18n/marketing/site-lang.ts`. English stays in the components; each entry here is
 * `"English": ["中文", "Tiếng Việt"]`. Keys with `{name}` are patterns: `{name}` matches any text
 * (a number, a name, a date) and is put back into the translation, translated too when it is
 * itself a known string. Legal clause text is deliberately not here (see docs/i18n.md).
 */
export type AppStrings = Record<string, readonly [zh: string, vi: string]>;

const ALL: AppStrings[] = [
  shellStrings,
  studioStrings,
  studentStrings,
  billingStrings,
  coursesStrings,
  snapshotStrings,
  settingsStrings,
  familyStrings,
  tourStrings,
  benchmarkStrings,
  extraStrings,
  assignmentStrings,
  termBillingStrings,
];

const exact: Record<Exclude<Lang, "en">, Map<string, string>> = {
  "zh-CN": new Map(),
  vi: new Map(),
};
interface Pattern {
  re: RegExp;
  names: string[];
  probe: string;
  out: Record<Exclude<Lang, "en">, string>;
}
const patterns: Pattern[] = [];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NUMERIC =
  /^(n|n\d|count|num|pct|percent|minutes|hours|days|weeks|total|seen|stage|term|year|weeks|n2)$/;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

for (const dict of ALL) {
  for (const [rawKey, [zh, vi]] of Object.entries(dict)) {
    const key = norm(rawKey);
    if (!/\{[a-zA-Z0-9_]+\}/.test(key)) {
      exact["zh-CN"].set(key, zh);
      exact.vi.set(key, vi);
      continue;
    }
    const names: string[] = [];
    const parts = key.split(/(\{[a-zA-Z0-9_]+\})/);
    const source = parts
      .map((part) => {
        const m = part.match(/^\{([a-zA-Z0-9_]+)\}$/);
        if (!m?.[1]) return escape(part);
        names.push(m[1]);
        // {n}, {count}, {pct}… only match numbers, so "{n} min" never swallows a sentence.
        return NUMERIC.test(m[1]) ? "(-?[\\d.,]+)" : "(.+?)";
      })
      .join("");
    const literals = parts.filter((p) => !/^\{[a-zA-Z0-9_]+\}$/.test(p));
    const probe = literals.reduce((a, b) => (b.trim().length > a.length ? b.trim() : a), "");
    patterns.push({ re: new RegExp(`^${source}$`), names, probe, out: { "zh-CN": zh, vi } });
  }
}
// Longer literal text first, so "Lessons in Term {n} ({count})" wins over "{a} ({b})".
patterns.sort((a, b) => b.probe.length - a.probe.length);

/** Exact app string, or null. */
export function appText(lang: Lang, english: string): string | null {
  if (lang === "en") return english;
  return exact[lang].get(english) ?? null;
}

/** Pattern match (e.g. "Lessons in Term 2"), or null. `inner` translates captured values. */
export function appPattern(
  lang: Lang,
  english: string,
  inner: (part: string) => string,
): string | null {
  if (lang === "en") return english;
  for (const p of patterns) {
    if (p.probe && !english.includes(p.probe)) continue;
    const m = english.match(p.re);
    if (!m) continue;
    let out = p.out[lang];
    p.names.forEach((name, i) => {
      const value = m[i + 1] ?? "";
      out = out.replaceAll(`{${name}}`, inner(value));
    });
    return out;
  }
  return null;
}

/** For tests: every English key, so coverage can be checked against the components. */
export function appKeys(): string[] {
  return ALL.flatMap((d) => Object.keys(d).map(norm));
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ZH_DAYS = ["一", "二", "三", "四", "五", "六", "日"];
const VI_DAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
const VI_DAYS_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const monthIndex = (m: string) => MONTHS.findIndex((full) => full.slice(0, 3) === m.slice(0, 3));
const dayIndex = (d: string) => DAYS.findIndex((full) => full.slice(0, 3) === d.slice(0, 3));
const DATE_RE =
  /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? )?(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:,? (\d{4}))?(?:,? (\d{1,2}):(\d{2}) ?(am|pm))?$/;
const TIME_RE = /^(\d{1,2}):(\d{2}) ?(am|pm)$/;

function clock(lang: Exclude<Lang, "en">, h: string, m: string, ap: string) {
  const hour = Number(h);
  if (lang === "vi") return `${(hour % 12) + (ap === "pm" ? 12 : 0)}:${m}`;
  return `${ap === "am" ? "上午" : "下午"}${hour}:${m}`;
}

/** en-AU dates and times as the app prints them ("Mon 16 Nov", "Monday 15 March 2027", "3:30 pm"). */
export function appDate(lang: Lang, text: string): string | null {
  if (lang === "en") return text;
  const t = text.match(TIME_RE);
  if (t?.[1] && t[2] && t[3]) return clock(lang, t[1], t[2], t[3]);
  const m = text.match(DATE_RE);
  if (!m?.[2] || !m[3]) return null;
  const [, wd, day, mon, year, h, min, ap] = m;
  const mi = monthIndex(mon) + 1;
  const di = wd ? dayIndex(wd) : -1;
  const long = !!wd && text.startsWith(DAYS[di] ?? "~");
  const time = h && min && ap ? clock(lang, h, min, ap) : "";
  if (lang === "zh-CN") {
    const date = `${year ? `${year}年` : ""}${mi}月${day}日`;
    const weekday = di >= 0 ? ` ${long ? "星期" : "周"}${ZH_DAYS[di]}` : "";
    return `${date}${weekday}${time ? ` ${time}` : ""}`;
  }
  const weekday = di >= 0 ? `${(long ? VI_DAYS : VI_DAYS_SHORT)[di]}, ` : "";
  const date = long || year ? `${day} tháng ${mi}${year ? `, ${year}` : ""}` : `${day} thg ${mi}`;
  return `${weekday}${date}${time ? ` ${time}` : ""}`;
}
