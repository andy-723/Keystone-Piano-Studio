import type { LegalClause, TermsOptionalSwitch } from "@/mocks/legal-template-au";

export type TermsMergeValues = Record<string, unknown>;
export type TermsSwitches = Partial<Record<TermsOptionalSwitch, boolean>>;

export function getMergeValue(values: TermsMergeValues, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in (current as object)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, values);
}

/** Fill {{field.path}} tags; drop optional clauses whose switch is off. */
export function renderTerms(
  template: LegalClause[],
  values: TermsMergeValues,
  switches: TermsSwitches = {},
): { markdown: string; missingRequired: string[] } {
  const missingRequired = new Set<string>();
  const sections: string[] = [];

  for (const clause of template) {
    if (clause.optional && !switches[clause.optional]) continue;
    const body = clause.body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, path: string) => {
      const value = getMergeValue(values, path);
      if (value === undefined || value === null || value === "") {
        missingRequired.add(path);
        return `{{${path}}}`;
      }
      return String(value);
    });
    sections.push(`## ${clause.heading}\n\n${body}`);
  }

  return {
    markdown: sections.join("\n\n"),
    missingRequired: [...missingRequired].sort(),
  };
}

/** SHA-256 hex digest of rendered markdown (Web Crypto). */
export async function hashTerms(markdown: string): Promise<string> {
  const data = new TextEncoder().encode(markdown);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function additionalTermsWarnings(text: string): string[] {
  const lower = text.toLowerCase();
  return [
    "surcharge",
    "card fee",
    "admin fee",
    "no refund",
    "non-refundable",
  ].filter((word) => lower.includes(word));
}

/** Cap late fee: lower of setting, A$15, and 5% of invoice total (cents in / cents out). */
export function applyLateFeeCents(settingDollars: number, invoiceTotalCents: number): number {
  const settingCents = Math.round(settingDollars * 100);
  const fivePercent = Math.round(invoiceTotalCents * 0.05);
  return Math.min(settingCents, 1500, fivePercent);
}
