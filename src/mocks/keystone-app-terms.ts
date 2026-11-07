/**
 * Keystone Music HQ family app terms and privacy notice.
 * DRAFT wording — the Claude artifact source was unreachable at implementation time;
 * replace after solicitor review. Entity name is not final.
 */
export const KEYSTONE_ENTITY = "[Keystone legal entity]";

/** When false, the owner Studio terms screen shows a draft note. */
export const reviewed = false;

export const FAMILY_APP_TERMS_VERSION = 1;
export const FAMILY_APP_TERMS_EFFECTIVE_AT = "2027-01-01";

export const FAMILY_APP_TERMS_MARKDOWN = `# Keystone Music HQ — App terms of use

**Draft wording, pending legal review.**

These App terms are between you and ${KEYSTONE_ENTITY} ("Keystone") for your use of the Keystone Music HQ family app. Your studio's lesson agreement is separate and is with your studio, not with Keystone.

## 1. The app
Keystone provides software that helps your studio schedule lessons, share practice, chat, and invoice. Keystone is not your music teacher and does not provide the lessons.

## 2. Your account
You must give accurate details and keep login details safe. You may only use the app for your family's enrolment with a studio that uses Keystone Music HQ.

## 3. Acceptable use
Do not misuse the app, upload unlawful content, or attempt to access another family's data. Keystone may suspend access for misuse.

## 4. Privacy
Keystone's Privacy notice explains how we handle personal information. The studio also has its own privacy obligations under Australian law.

## 5. Limitation
To the extent permitted by the Australian Consumer Law, Keystone's liability for the app is limited to resupply of the service or the cost of resupply.

## 6. Changes
Material changes to these App terms will be notified in the app. Continued use after the effective date means you accept the updated terms.

## 7. Contact
Contact ${KEYSTONE_ENTITY} via the in-app help channel or the privacy email published in the Privacy notice.
`;

export const PRIVACY_NOTICE_MARKDOWN = `# Keystone Music HQ — Privacy notice

**Draft wording, pending legal review.**

${KEYSTONE_ENTITY} ("Keystone") operates Keystone Music HQ. This notice covers personal information we handle as the app provider. Your studio is separately responsible for information it collects about your family.

## What we collect
Account details, lesson schedule metadata, chat and practice records stored in the app, device and security logs, and payment status metadata when online payments are connected.

## Why we collect it
To provide the app to your studio and family, keep accounts secure, support billing features your studio enables, and meet Australian legal obligations.

## Overseas disclosure
{{privacy.overseasCountriesLabel}}. Support staff may access limited account data only when needed to fix a problem.

## Storage
{{privacy.keystoneStorageStatement}}

## Your rights
You may ask to access or correct personal information, or raise a privacy complaint with Keystone and, if unresolved, the Office of the Australian Information Commissioner (OAIC).

## Contact
privacy@keystone.example (placeholder until the legal entity is final).
`;
