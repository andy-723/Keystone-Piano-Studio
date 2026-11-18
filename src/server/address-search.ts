import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { isMockOnboarding } from "./env";
import { verifyAccessToken } from "./session";

/**
 * Australian address autocomplete for the studio address question.
 *
 * Provider: Google Places API (New), server-side only, so the key never reaches the browser.
 * Without GOOGLE_PLACES_API_KEY the search returns `enabled: false` and the field stays a
 * plain text box, so nothing breaks before the key is added.
 *
 * Billing: each typing session sends a session token. Google bills a session that ends in a
 * Place Details call as that one Details call, so the keystroke requests are not billed
 * separately. Restrict the key to the Places API (New) in Google Cloud and set a daily quota.
 */

export type AddressSuggestion = { placeId: string; label: string; main: string; secondary: string };
export type AddressDetails = {
  formatted: string;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
};

const AU_STATES = new Set(["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"]);
const RATE_PER_MIN = 60;
const buckets = new Map<string, number[]>();

function placesKey(): string {
  const value = typeof process !== "undefined" ? process.env["GOOGLE_PLACES_API_KEY"] : undefined;
  return value?.trim() ?? "";
}

function requestIp(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Per-IP sliding one-minute window. Protects the Google quota from scripted abuse. */
export function allowAddressLookup(ip: string, now = Date.now()): boolean {
  const recent = (buckets.get(ip) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= RATE_PER_MIN) {
    buckets.set(ip, recent);
    return false;
  }
  recent.push(now);
  buckets.set(ip, recent);
  if (buckets.size > 5000) {
    // Drop only IPs with nothing in the last minute, so an active IP never gets a fresh window.
    for (const [key, times] of buckets) {
      if (!times.some((at) => now - at < 60_000)) buckets.delete(key);
    }
  }
  return true;
}

function cleanToken(token: unknown): string | undefined {
  return typeof token === "string" && /^[A-Za-z0-9-]{8,64}$/.test(token) ? token : undefined;
}

/** "530 Collins St, Melbourne VIC 3000, Australia" -> "530 Collins St, Melbourne VIC 3000" */
export function stripCountry(text: string): string {
  return text.replace(/,\s*Australia\s*$/i, "").trim();
}

type GoogleComponent = { longText?: string; shortText?: string; types?: string[] };

export function parseAddressComponents(
  formattedAddress: string,
  components: GoogleComponent[],
): AddressDetails {
  const find = (type: string) => components.find((component) => component.types?.includes(type));
  const subpremise = find("subpremise")?.shortText ?? "";
  const number = find("street_number")?.shortText ?? "";
  const route = find("route")?.longText ?? "";
  const suburb = find("locality")?.longText ?? find("sublocality")?.longText ?? "";
  const stateRaw = (find("administrative_area_level_1")?.shortText ?? "").toUpperCase();
  const postcode = find("postal_code")?.shortText ?? "";
  const streetNumber = subpremise && number ? `${subpremise}/${number}` : number;
  const street = [streetNumber, route].filter(Boolean).join(" ");
  const formatted =
    stripCountry(formattedAddress) ||
    [street, [suburb, stateRaw, postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { formatted, street, suburb, state: AU_STATES.has(stateRaw) ? stateRaw : "", postcode };
}

export async function searchAddresses(
  query: string,
  sessionToken: string | undefined,
  options: { key?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ enabled: boolean; suggestions: AddressSuggestion[] }> {
  const key = options.key ?? placesKey();
  if (!key) return { enabled: false, suggestions: [] };
  const input = query.trim().slice(0, 200);
  if (input.length < 3) return { enabled: true, suggestions: [] };
  const response = await (options.fetchImpl ?? fetch)(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["au"],
        languageCode: "en-AU",
        ...(sessionToken ? { sessionToken } : {}),
      }),
    },
  );
  if (!response.ok) return { enabled: true, suggestions: [] };
  const data = (await response.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }[];
  };
  const suggestions = (data.suggestions ?? [])
    .map((entry) => entry.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> =>
      Boolean(prediction?.placeId),
    )
    .slice(0, 5)
    .map((prediction) => ({
      placeId: prediction.placeId!,
      label: stripCountry(prediction.text?.text ?? ""),
      main:
        prediction.structuredFormat?.mainText?.text ?? stripCountry(prediction.text?.text ?? ""),
      secondary: stripCountry(prediction.structuredFormat?.secondaryText?.text ?? ""),
    }));
  return { enabled: true, suggestions };
}

export async function addressDetails(
  placeId: string,
  sessionToken: string | undefined,
  options: { key?: string; fetchImpl?: typeof fetch } = {},
): Promise<AddressDetails | null> {
  const key = options.key ?? placesKey();
  if (!key || !/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return null;
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set("languageCode", "en-AU");
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const response = await (options.fetchImpl ?? fetch)(url.toString(), {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "formattedAddress,addressComponents" },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    formattedAddress?: string;
    addressComponents?: GoogleComponent[];
  };
  return parseAddressComponents(data.formattedAddress ?? "", data.addressComponents ?? []);
}

/** Live site: only signed-in users may spend the Places quota. Mock/dev builds skip the check. */
async function signedIn(accessToken: unknown): Promise<boolean> {
  if (isMockOnboarding()) return true;
  if (typeof accessToken !== "string" || !accessToken) return false;
  try {
    await verifyAccessToken(accessToken);
    return true;
  } catch {
    return false;
  }
}

export const searchAddressFn = createServerFn({ method: "POST" })
  .validator((data: { query: string; sessionToken?: string; accessToken?: string }) => data)
  .handler(async ({ data }) => {
    if (!placesKey()) return { enabled: false, suggestions: [] as AddressSuggestion[] };
    if (!allowAddressLookup(requestIp()))
      return { enabled: true, suggestions: [] as AddressSuggestion[] };
    // Not signed in (or token expired): no suggestions this time, but keep the box live so a refreshed session can retry.
    if (!(await signedIn(data.accessToken)))
      return { enabled: true, suggestions: [] as AddressSuggestion[] };
    try {
      return await searchAddresses(String(data.query ?? ""), cleanToken(data.sessionToken));
    } catch {
      return { enabled: true, suggestions: [] as AddressSuggestion[] };
    }
  });

export const addressDetailsFn = createServerFn({ method: "POST" })
  .validator((data: { placeId: string; sessionToken?: string; accessToken?: string }) => data)
  .handler(async ({ data }) => {
    if (!allowAddressLookup(requestIp())) return null;
    if (!(await signedIn(data.accessToken))) return null;
    try {
      return await addressDetails(String(data.placeId ?? ""), cleanToken(data.sessionToken));
    } catch {
      return null;
    }
  });
