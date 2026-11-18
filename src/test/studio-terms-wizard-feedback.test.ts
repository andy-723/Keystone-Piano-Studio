import { describe, expect, it } from "vitest";
import {
  addressDetails,
  allowAddressLookup,
  parseAddressComponents,
  searchAddresses,
} from "@/server/address-search";
import {
  clauseFields,
  fromFriendlyClause,
  previewClause,
  toFriendlyClause,
} from "@/lib/clause-placeholders";
import { buildMergeValues } from "@/mocks/terms";
import { STUDIO_TERMS_ONBOARDING_STEPS } from "@/lib/studio-terms-onboarding-steps";
import { LEGAL_TEMPLATE_AU } from "@/mocks/legal-template-au";

describe("address autocomplete", () => {
  it("is switched off without a Places key", async () => {
    await expect(searchAddresses("530 Collins", "token-12345", { key: "" })).resolves.toEqual({
      enabled: false,
      suggestions: [],
    });
  });

  it("asks Google for Australian results and strips the country", async () => {
    let body = "";
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(
        JSON.stringify({
          suggestions: [
            {
              placePrediction: {
                placeId: "ChIJabc1234567",
                text: { text: "530 Collins Street, Melbourne VIC, Australia" },
                structuredFormat: {
                  mainText: { text: "530 Collins Street" },
                  secondaryText: { text: "Melbourne VIC, Australia" },
                },
              },
            },
          ],
        }),
      );
    }) as typeof fetch;
    const result = await searchAddresses("530 Collins", "token-12345", { key: "k", fetchImpl });
    expect(JSON.parse(body).includedRegionCodes).toEqual(["au"]);
    expect(result.suggestions[0]).toEqual({
      placeId: "ChIJabc1234567",
      label: "530 Collins Street, Melbourne VIC",
      main: "530 Collins Street",
      secondary: "Melbourne VIC",
    });
  });

  it("reads unit, street, suburb, state and postcode", () => {
    const details = parseAddressComponents("1208/530 Collins St, Melbourne VIC 3000, Australia", [
      { shortText: "1208", types: ["subpremise"] },
      { shortText: "530", types: ["street_number"] },
      { longText: "Collins Street", types: ["route"] },
      { longText: "Melbourne", types: ["locality"] },
      { shortText: "VIC", types: ["administrative_area_level_1"] },
      { shortText: "3000", types: ["postal_code"] },
    ]);
    expect(details).toEqual({
      formatted: "1208/530 Collins St, Melbourne VIC 3000",
      street: "1208/530 Collins Street",
      suburb: "Melbourne",
      state: "VIC",
      postcode: "3000",
    });
  });

  it("rejects odd place ids without calling Google", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;
    await expect(addressDetails("../etc", undefined, { key: "k", fetchImpl })).resolves.toBeNull();
    expect(called).toBe(false);
  });

  it("rate limits per IP", () => {
    const now = 1_000_000;
    for (let i = 0; i < 60; i += 1) expect(allowAddressLookup("203.0.113.9", now)).toBe(true);
    expect(allowAddressLookup("203.0.113.9", now)).toBe(false);
    expect(allowAddressLookup("203.0.113.9", now + 61_000)).toBe(true);
  });
});

describe("clause editor placeholders", () => {
  const values = buildMergeValues({
    studioName: "Andy Studio",
    state: "VIC",
    email: "hello@andy.example",
    teacherName: "Andy",
    policies: {
      cancelNoticeHours: 24,
      makeUpQuota: 1,
      makeUpPeriod: "term",
      makeUpExpiry: "same term",
      onlinePlatform: "Zoom",
      publicHolidays: "skip",
      tuningFrequency: "once a year",
      inactiveRetentionMonths: 24,
    },
  });

  it("shows friendly labels and saves real tokens", () => {
    const body =
      "Lessons that fall on a public holiday in {{studio.state}} {{policies.publicHolidayRule}}.";
    const friendly = toFriendlyClause(body);
    expect(friendly).toBe(
      "Lessons that fall on a public holiday in [Studio state] [Public holiday rule].",
    );
    expect(fromFriendlyClause(friendly)).toBe(body);
    expect(fromFriendlyClause("Bring your [own books].")).toBe("Bring your [own books].");
  });

  it("previews the clause with answers filled in", () => {
    expect(
      previewClause(
        "Lessons that fall on a public holiday in {{studio.state}} {{policies.publicHolidayRule}}.",
        values,
      ),
    ).toBe("Lessons that fall on a public holiday in VIC are not held and are not charged.");
    expect(clauseFields("tuned at least {{policies.tuningFrequency}}", values)).toEqual([
      { path: "policies.tuningFrequency", label: "Piano tuning frequency", value: "once a year" },
    ]);
  });

  it("every template field has a unique label", () => {
    const paths = new Set<string>();
    for (const clause of LEGAL_TEMPLATE_AU)
      for (const match of clause.body.matchAll(/\{\{([a-zA-Z0-9_.]+)\}\}/g)) paths.add(match[1]!);
    const labels = [...paths].map((path) => toFriendlyClause(`{{${path}}}`));
    expect(labels.every((label) => !label.includes("."))).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("privacy email and policy questions", () => {
  it("falls back to the studio email when no privacy email is set", () => {
    const values = buildMergeValues({
      studioName: "A",
      email: "hello@andy.example",
      teacherName: "T",
    }) as { studio: { privacyEmail: string } };
    expect(values.studio.privacyEmail).toBe("hello@andy.example");
    const own = buildMergeValues({
      studioName: "A",
      email: "hello@andy.example",
      privacyEmail: "privacy@andy.example",
      teacherName: "T",
    }) as { studio: { privacyEmail: string } };
    expect(own.studio.privacyEmail).toBe("privacy@andy.example");
  });

  it("no longer asks for a separate privacy email, and tuning is a choice", () => {
    expect(STUDIO_TERMS_ONBOARDING_STEPS.some((step) => step.id === "privacyEmail")).toBe(false);
    const tuning = STUDIO_TERMS_ONBOARDING_STEPS.find((step) => step.id === "tuningFrequency");
    expect(tuning?.kind).toBe("select");
    expect(tuning?.options?.[0]?.value).toBe("once a year");
    expect(STUDIO_TERMS_ONBOARDING_STEPS.find((step) => step.id === "address")?.kind).toBe(
      "address",
    );
  });
});
