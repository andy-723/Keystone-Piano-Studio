# Studio address autocomplete

The studio address question (terms wizard step 4, and Settings > Studio terms > Address) suggests
Australian street addresses and suburbs as the owner types. Picking one fills the full address and
sets the State question from it.

## How it works

- Browser -> our server functions `searchAddressFn` / `addressDetailsFn` (`src/server/address-search.ts`)
  -> Google Places API (New): `places:autocomplete` (restricted to `au`) then Place Details with only
  `formattedAddress,addressComponents`.
- The API key stays on the server. It is never sent to the browser.
- Each typing session uses one session token. Google bills a session that ends in a Place Details
  call as that Details call, so keystrokes are not billed one by one. Check current prices and free
  allowances at https://developers.google.com/maps/billing-and-pricing/pricing before launch.
- 60 lookups per minute per IP, in memory, to protect the quota.
- No key, an error, or a quota hit: the field behaves as a plain text box. Owners can always type.
- The list shows "Address suggestions by Google" (Google's attribution rule when no Google map is shown).

## Privacy

Only what the owner types into the address box (a business address) goes to Google. No family or
student data is sent. Google is already listed as a supplier (Calendar, sign-in); add "address
lookup" to the supplier list wording at the next privacy update.

## Setup (Andrew)

1. Google Cloud console, Keystone Music HQ project: enable **Places API (New)**. Billing must be on.
2. Credentials > Create API key. Restrict it: API restriction = Places API (New) only.
   (Application restriction by IP isn't practical on Vercel; the API restriction plus a quota is the guard.)
3. APIs & Services > Places API (New) > Quotas: set a daily cap (e.g. 1,000 requests/day for the pilot).
4. Vercel > Settings > Environment Variables: `GOOGLE_PLACES_API_KEY` (Production + Preview), then redeploy.
