import {
  articleText,
  articlesFor,
  type HelpArticle,
  type HelpAudience,
  type HelpLang,
} from "./articles";

/** Words that never help pick an article. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "do",
  "does",
  "for",
  "from",
  "get",
  "have",
  "how",
  "i",
  "in",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "where",
  "why",
  "with",
  "you",
  "your",
  "me",
  "we",
  "our",
  "be",
  "not",
  "this",
  "that",
  "there",
  "please",
  "help",
  "hi",
  "hello",
]);

const HAN = /[㐀-鿿]/;

export function normaliseQuery(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits a query into search terms. Latin words are split on spaces (stop words dropped,
 * a trailing "s" trimmed). Chinese has no spaces, so each run of Han characters becomes
 * overlapping two-character pieces, which match words like 账单 inside a longer sentence.
 */
export function queryTerms(value: string): string[] {
  const terms = new Set<string>();
  for (const word of normaliseQuery(value).split(" ")) {
    if (!word) continue;
    if (HAN.test(word)) {
      const chars = [...word].filter((char) => HAN.test(char));
      if (chars.length === 1) terms.add(chars[0]!);
      for (let i = 0; i < chars.length - 1; i += 1) terms.add(`${chars[i]}${chars[i + 1]}`);
      continue;
    }
    if (word.length < 2 || STOP_WORDS.has(word)) continue;
    terms.add(word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);
  }
  return [...terms];
}

export type HelpMatch = { article: HelpArticle; score: number };

/**
 * Ranks articles for a query: title hits count most, then keywords, then body text.
 * Searches both languages of a family article, so a parent can type in either.
 */
export function searchArticles(
  query: string,
  audience: HelpAudience,
  options: { lang?: HelpLang; limit?: number } = {},
): HelpMatch[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const limit = options.limit ?? 5;
  const matches: HelpMatch[] = [];
  for (const article of articlesFor(audience)) {
    const title = normaliseQuery(`${article.title.en} ${article.title["zh-CN"] ?? ""} ${article.title.vi ?? ""}`);
    const keywords = article.keywords.map(normaliseQuery).join(" | ");
    const body = normaliseQuery(`${article.body.en} ${article.body["zh-CN"] ?? ""} ${article.body.vi ?? ""}`);
    let score = 0;
    let hits = 0;
    for (const term of terms) {
      let termScore = 0;
      if (title.includes(term)) termScore += 4;
      if (keywords.includes(term)) termScore += 3;
      if (body.includes(term)) termScore += 1;
      if (termScore > 0) hits += 1;
      score += termScore;
    }
    if (score === 0) continue;
    // Reward articles that match more of the question, not one word many times.
    score *= hits / terms.length + 0.5;
    matches.push({ article, score });
  }
  matches.sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id));
  // Drop weak tail matches (a single body-only hit when better ones exist).
  const best = matches[0]?.score ?? 0;
  return matches.filter((match) => match.score >= Math.max(1, best * 0.25)).slice(0, limit);
}

/** Short plain-text preview for a suggestion list. */
export function articleSnippet(article: HelpArticle, lang: HelpLang, max = 140): string {
  const text = articleText(article.body, lang).replace(/^- /gm, "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
