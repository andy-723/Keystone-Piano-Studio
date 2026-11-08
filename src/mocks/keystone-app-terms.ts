/**
 * Keystone Music HQ family app terms v3 (8 Nov 2026) — Parts A–D only.
 * Never include solicitor appendix E1–E3.
 * Source Claude artifact was unreachable; Parts A–D are the best available v3 product copy
 * aligned with Studio Agreement AU v3 (product-final). Replace with counsel-settled text when available.
 */
export const KEYSTONE_ENTITY = "Synoratech Pty Ltd, ACN [ ], ABN [ ]";

/** When false, the owner Studio terms screen shows a draft-blocking note. Product-final: true. */
export const reviewed = true;

export const FAMILY_APP_TERMS_VERSION = 1;
export const FAMILY_APP_TERMS_EFFECTIVE_AT = "2026-11-08";

export const KEYSTONE_PRIVACY_EMAIL = "privacy@keystone.example";

/** Part C — Privacy notice (also linked from the acceptance scrolling panel). */
export const PRIVACY_NOTICE_MARKDOWN = `## Part C — Privacy notice

${KEYSTONE_ENTITY} ("Keystone") operates Keystone Music HQ. This notice covers personal information we handle as the app provider. Your studio is separately responsible for information it collects about your family under its own privacy policy.

### What we collect
Account details, lesson schedule metadata, chat and practice records stored in the app, device and security logs, and payment status metadata when online payments are connected.

### Why we collect it
To provide the app to your studio and family, keep accounts secure, support billing features your studio enables, and meet Australian legal obligations.

### Overseas disclosure
{{privacy.overseasCountriesLabel}}. Support staff may access limited account data only when needed to fix a problem.

### Storage
{{privacy.keystoneStorageStatement}}

### Your rights
You may ask to access or correct personal information, or raise a privacy complaint with Keystone and, if unresolved, the Office of the Australian Information Commissioner (OAIC).

### Contact
${KEYSTONE_PRIVACY_EMAIL}
`;

/**
 * Full family app terms Parts A–D (acceptance, receipts, PDF).
 * Part C is the privacy notice; appendices E1–E3 are intentionally omitted.
 */
export const FAMILY_APP_TERMS_MARKDOWN = `# Keystone Music HQ — Family app terms

Version ${FAMILY_APP_TERMS_VERSION} · Effective ${FAMILY_APP_TERMS_EFFECTIVE_AT}

## Part A — Parties and the app

These App terms are between you and ${KEYSTONE_ENTITY} ("Keystone") for your use of the Keystone Music HQ family app. Your studio's lesson agreement is separate and is with your studio, not with Keystone.

Keystone provides software that helps your studio schedule lessons, share practice, chat, and invoice. Keystone is not your music teacher and does not provide the lessons.

## Part B — Account and acceptable use

### Your account
You must give accurate details and keep login details safe. You may only use the app for your family's enrolment with a studio that uses Keystone Music HQ.

### Acceptable use
Do not misuse the app, upload unlawful content, or attempt to access another family's data. Keystone may suspend access for misuse.

### Privacy
Keystone's Privacy notice (Part C) explains how we handle personal information. The studio also has its own privacy obligations under Australian law.

${PRIVACY_NOTICE_MARKDOWN}

## Part D — Liability, changes and contact

### Limitation
To the extent permitted by the Australian Consumer Law, Keystone's liability for the app is limited to resupply of the service or the cost of resupply. Nothing in these terms excludes rights you cannot lawfully waive.

### Changes
Material changes to these App terms will be notified in the app. Continued use after the effective date means you accept the updated terms.

### Contact
Contact ${KEYSTONE_ENTITY} via the in-app help channel or ${KEYSTONE_PRIVACY_EMAIL}.
`;
