import {
  FAMILY_APP_TERMS_MARKDOWN,
  KEYSTONE_ENTITY,
  PRIVACY_NOTICE_MARKDOWN,
} from "@/mocks/keystone-app-terms";
import { KEYSTONE_STORAGE_STATEMENT, OVERSEAS_COUNTRIES_LABEL } from "@/mocks/keystone-suppliers";

function fill(markdown: string): string {
  return markdown
    .replaceAll("{{privacy.overseasCountriesLabel}}", OVERSEAS_COUNTRIES_LABEL)
    .replaceAll(
      "{{privacy.keystoneStorageStatement}}",
      KEYSTONE_STORAGE_STATEMENT.replace("[Keystone legal entity]", KEYSTONE_ENTITY),
    );
}

/** Same Keystone app terms families accept in the app, for the public /terms page. */
export const PUBLIC_TERMS_MARKDOWN = fill(FAMILY_APP_TERMS_MARKDOWN);

/** Keystone privacy notice (Part C of the app terms), for the public /privacy page. */
export const PUBLIC_PRIVACY_MARKDOWN = fill(PRIVACY_NOTICE_MARKDOWN).replace(
  "## Part C — Privacy notice",
  "",
);

/**
 * Website terms and disclaimer for the public marketing pages (/welcome, /pricing, /help).
 * Drawn from the family app terms (Parts A and D) and the plan pricing. Not yet lawyer-reviewed;
 * operator details (ABN etc.) are added once the company is incorporated.
 */
export const PUBLIC_DISCLAIMER_MARKDOWN = `These terms cover your use of this website, including the welcome, pricing and help pages. Using the Keystone Music HQ app itself is covered by the Terms of use and the Privacy notice, linked at the foot of this page.

## What Keystone Music HQ is

Keystone Music HQ ("Keystone") is software that helps music studios schedule lessons, share practice, chat with families and send invoices. Keystone is not a music teacher and does not provide lessons. Each studio's lesson agreement is between the studio and its families, not with Keystone.

## Information on this website

- The screens, figures, names and studios shown on this website are sample data for illustration. They are not real studios, students or results.
- Some features shown are marked as planned. Planned features may change, arrive later or not be released.
- We try to keep this website accurate and current, but it is general information only and may contain errors or be out of date.

## Not financial, tax or legal advice

Studio Snapshot, Tax Lite and other money tools summarise records you keep in Keystone. They are not financial, tax, accounting or legal advice, do not lodge anything with the ATO, and do not replace a registered tax agent or accountant. Keystone is not a registered tax or BAS agent and does not decide what is deductible. Figures are estimates based on your data. Check your own circumstances, including GST registration, with a qualified adviser.

## Prices

Prices are in Australian dollars, per studio, per month. Base is A$29 a month for up to 30 students and Pro is A$49 a month with no student limit. Prices may change; the price that applies to your studio is the one in your studio agreement.

## Links to other websites

This website may link to other websites, such as payment or accounting providers. Keystone is not responsible for their content or how they handle your information.

## Liability

To the extent permitted by law, Keystone is not liable for any loss arising from your use of, or reliance on, this website. Nothing on this website excludes, restricts or changes any right you have under the Australian Consumer Law that cannot lawfully be excluded.

## Intellectual property

The Keystone Music HQ name, logo, text and images on this website belong to Keystone or its licensors. Please don't copy or reuse them without permission.

## Changes and contact

We may update these website terms from time to time; the current version is always on this page. Questions: support@keystonemusichq.com.
`;
