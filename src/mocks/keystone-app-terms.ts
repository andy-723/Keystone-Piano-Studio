/**
 * Keystone Music HQ family app terms v3 (8 Nov 2026) — Parts A–D only, from
 * legal/Keystone-Family-App-Terms-and-Privacy-v3.pdf (source family-app-terms-v3.html).
 * Never include solicitor appendix E1–E3. Bracketed [ ] fields are facts still to be filled in.
 * Not yet settled by a solicitor (see SOLICITOR_SETTLED). Change every document in an E1 row together.
 */
export const KEYSTONE_ENTITY = "Synoratech Pty Ltd, ACN [ ], ABN [ ]";

/** Product-final flag for the studio agreement template. It does NOT mean a solicitor has settled the wording. */
export const reviewed = true;

/** True only once an Australian solicitor has settled the family app terms and privacy policy. */
export const SOLICITOR_SETTLED = false;

export const FAMILY_APP_TERMS_VERSION = 1;
export const FAMILY_APP_TERMS_EFFECTIVE_AT = "2026-11-08";

export const KEYSTONE_PRIVACY_EMAIL = "privacy@keystonemusichq.com";
export const KEYSTONE_SUPPORT_EMAIL = "support@keystonemusichq.com";

/**
 * Part B (privacy notice summary) + Part C (full Keystone privacy policy).
 * Shown in the acceptance scrolling panel and on the public /privacy page.
 */
export const PRIVACY_NOTICE_MARKDOWN = `## Part B — Privacy notice (summary)

This is the short version shown when you create your login. The full Keystone privacy policy follows in Part C.

**Two kinds of information.** Your family's lesson records belong to your studio, which decides how they are used under its privacy policy. Keystone stores and handles them for the studio, on its instructions. Keystone separately holds a small amount of information for itself: your login, settings, security logs and support records. Keystone is responsible for that in its own right.

**Where it's kept.** {{privacy.keystoneStorageStatement}} Some suppliers handle limited information overseas: {{privacy.overseasCountriesLabel}}. Part C5 lists each supplier and its country.

**Children.** We don't sell personal information, show advertising, or use children's information for advertising, marketing or behavioural profiling, or to train general-purpose AI models. The app tracks lesson progress and practice for your studio. Those are teaching tools, not advertising.

**Security.** Information is encrypted in transit and at rest in Keystone's systems. This is not end-to-end encryption. Emails and app notifications leave those systems, so health notes and message contents are kept out of them.

**Keystone staff access.** Keystone staff see your family's records only with a time-limited, logged grant your studio approves. In an emergency, such as a security incident or a risk to someone's safety, Keystone's founder or a named backup may access the least data needed without that grant. It is logged and reviewed, and your studio is told within 24 hours.

**Your choices.** For lesson records, ask your studio first. For information Keystone holds for itself, or if you can't resolve something with your studio, contact ${KEYSTONE_PRIVACY_EMAIL}.

## Part C — Keystone privacy policy

### C1. Our two roles
Keystone has two roles. (1) For your studio: we store and handle your family's lesson records ("Studio Data") to run the app, on the studio's instructions. The studio's privacy policy explains what it collects and why, and the studio decides how those records are used. (2) For ourselves: we hold some information in our own right ("Keystone Data") and this policy covers that. We follow the Australian Privacy Principles for all information in the app, whether or not an exemption would apply to us.

### C2. What Keystone holds for itself, and why

| Information | Where it comes from | Why we use it |
| --- | --- | --- |
| Login details: name, email, sign-in method, authenticator settings | You, or your studio when it invites you | To create and secure your login and link it to your studios |
| App settings, such as language and larger text | You | To show the app the way you chose |
| Acceptance records: versions accepted, date, time, IP address, browser | The app, when you accept | To prove what was agreed and send you receipts |
| Security and technical logs: IP address, device and browser type, sign-in events, error reports, bot-check results | The app and our suppliers | To keep the app secure, stop misuse and fix faults |
| Support records: your messages to us and our notes | You | To help you and improve support |

We collect only what the app needs. If you don't give us your name and email, we can't create a login for you. We use this information to run, secure and support the app, and as the law requires. We may use de-identified information to run and improve the app, with controls so that no studio, family or student can reasonably be identified.

### C3. Lesson progress and Red Risk
The app records lesson notes, practice and progress for your studio. On the Pro plan it can alert a teacher when a student may need extra support, such as missed lessons or practice dropping off ("Red Risk"). These alerts are visible only to the student's teachers and studio administrators, never to other families, and aren't used for advertising or shared outside the studio. Teachers decide what to do with them. Automated alerts never make decisions about a student's enrolment or fees on their own.

### C4. Who we share Keystone Data with
We share it only with our suppliers, to run the app; with your studio, where it relates to your use of that studio's account (for example, that you accepted its terms); and with anyone the law requires, including under child-protection laws. We don't sell it or use it for advertising.

### C5. Suppliers and overseas handling
Information is stored in Sydney, with a nightly encrypted backup in Melbourne. We update this list before adding a supplier, and we give studios 30 days' notice first. At the date of this version, the suppliers are:

| Supplier | What it does | Country |
| --- | --- | --- |
| Supabase | Database, sign-in and file storage | Australia (Sydney) |
| Vercel | Runs the app | Australia (Sydney) [confirm edge network handling] |
| Backup storage | Nightly encrypted backup | Australia (Melbourne) [confirm provider] |
| Resend | Invites, receipts and alerts by email | United States |
| Apple and Google | App notifications on phones | United States |
| Google Calendar (only if a teacher connects it) | Copies lesson times into a Keystone calendar in the teacher's Google account | United States |
| Stripe | Keystone's own subscription billing to studios (not family payments) | Australia and United States [confirm] |
| Cloudflare Turnstile | Bot check at sign-in and enrolment | [confirm country] |

Before a supplier handles information overseas, we take reasonable steps, usually contract terms, so that it is protected consistently with the Australian Privacy Principles. Your studio's payment provider (Stripe) and any accounting software it connects are the studio's own suppliers, under its own agreements.

### C6. Security
We encrypt information in transit and at rest in our systems, keep each studio's records separate, require multi-factor sign-in for studio owners, administrators and Keystone staff, use bot checks at sign-in and enrolment, log administrator actions, and keep daily backups that we test. Encryption protects information inside our systems. Copies that leave them, such as emails, notifications or files you download, are protected by the services that carry or store them. We don't hold independent security certifications. We follow the Australian Signals Directorate's Essential Eight as an aim, not a certification.

### C7. Keystone staff access
Keystone support staff can see account details, such as your name and email, to help you. To see your family's lesson records, they need a time-limited grant that your studio approves in the app, and the access is logged. In an emergency, such as a security incident or a risk to someone's safety, Keystone's founder, or a named backup if the founder is unavailable, may approve access without the studio's grant. Emergency access is limited to what is necessary, logged and reviewed afterwards, and the studio is told within 24 hours, unless the law prevents it for a time.

### C8. How long we keep it
- Login details and settings: while your login is open, then [period] after you close it.
- Acceptance records: for as long as either agreement could be relied on, up to [period] after your last enrolment ends.
- Security logs: [period], longer only while an investigation needs them.
- Support records: [period] after the request is closed.
- Your family's lesson records: as your studio decides under its privacy policy. When a studio leaves Keystone, we delete them as our agreement with the studio requires. Backups expire on their own cycle, and all copies are gone within 155 days.

We don't keep anything indefinitely. When a period ends, we delete or de-identify the information.

### C9. Your rights: access, correction and deletion
You can ask for a copy of the information Keystone holds about you, ask us to correct it, or ask us to delete information we no longer need. Email ${KEYSTONE_PRIVACY_EMAIL}. We will check your identity, acknowledge your request within [number] business days, and reply within 30 days. If we can't do what you ask, for example because the law requires us to keep a record, or because it includes someone else's information, we will tell you why. For lesson records, we will pass your request to your studio, or help the studio deal with it, because the studio decides about those records. Adult students make these requests themselves.

### C10. Breaches and complaints
**Breaches.** If a security incident in Keystone's systems affects your family's information, we tell your studio without undue delay, and we work with the studio on telling you. If a breach is likely to cause you serious harm, you will be told as soon as practicable. Where the law requires, Keystone will also notify the Office of the Australian Information Commissioner (OAIC). We contact you only through your verified email or the app, never through a group channel, and in Simplified Chinese as well as English where your family uses it.

**Complaints.** Please contact us first at ${KEYSTONE_PRIVACY_EMAIL}. We will acknowledge your complaint within [number] business days and aim to resolve it within 30 days, telling you if it will take longer. If you're not satisfied, you can complain to the OAIC at oaic.gov.au or 1300 363 992.

### C11. Children's Online Privacy Code
The OAIC expects to register a Children's Online Privacy Code by 10 December 2026. We will review this policy against the registered Code and update it, with notice under A7, if the Code applies to Keystone.

### C12. Changes to this policy
We change this policy the same way as the terms in A7, and keep earlier versions available in the app.
`;

/**
 * Full family app terms Parts A–D (acceptance, receipts, PDF, public /terms).
 * Parts B and C are the privacy notice and policy; appendices E1–E3 are intentionally omitted.
 */
export const FAMILY_APP_TERMS_MARKDOWN = `# Keystone Music HQ — App terms of use and privacy

Version 3 of the drafted text · Effective ${FAMILY_APP_TERMS_EFFECTIVE_AT}

Your family has two agreements: one with your studio for lessons, and this one with Keystone for the app. Keystone is not a party to your agreement with the studio, and your studio is not a party to this one.

## Part A — App terms of use

### A1. Who we are and what we're responsible for
Keystone Music HQ is provided by ${KEYSTONE_ENTITY} ("Keystone", "we", "us"). Your music studio provides the lessons and is responsible for its own terms with you. Keystone provides the app your studio uses to run enrolments, lessons, messages and invoices.

Keystone is responsible for:
- providing the app with reasonable care and skill, and fixing problems that are ours;
- keeping the information in the app secure, as Part C explains;
- the information it holds for its own purposes (Part C, section C2);
- its own support, including technical errors, sign-in problems and suspected account compromise;
- its own legal obligations, including under the Australian Consumer Law and privacy law.

Your studio is responsible for its lessons, fees, refunds and the decisions it makes about your family's records.

### A2. Accepting these terms
Before you create your login, the app shows these terms and the privacy notice in full, in their own box, separate from your studio's terms. You accept by ticking a separate box. We record the version you accepted, your account, and the date and time, and we email you a copy. You can view and download every version you have accepted in the app at any time.

### A3. Logins and accounts
**Adults.** Each parent, guardian or adult student has their own login, which can link to more than one studio. Keep it safe and don't share it, including with other family members. You can add an authenticator app for extra security.

**Parents and guardians.** The studio adds each parent or guardian it enrols. Each one has their own login and sees the records of the students they are linked to. If a court order or a safety concern means one parent or guardian should not see a student's records or another parent's contact details, tell the studio or Keystone. The studio can limit that access, and can hide one guardian's contact details from another.

**Children.** A parent or guardian sets up a student's profile and is responsible for it. Students aged [own-login age] to 17 may have their own login if a parent or guardian allows it. This age is a product setting we have chosen, not a legal threshold. Younger students use a simple PIN on a parent's or guardian's device. We use the date of birth the parent or guardian gives us and never ask for ID documents.

**At 18.** A student who turns 18 takes control of their own login and records. A parent's or guardian's access to them ends unless the student chooses to keep it. Adult students who enrol themselves are never linked to a parent automatically.

### A4. Using the app
Use the app for your family's lessons only. Don't post anything unlawful, abusive or harmful to a child, or anything you don't have the right to share. Don't try to get into anyone else's account or information. We may suspend a login that is being misused or appears to be compromised, and we will tell you why unless that would put someone at risk.

### A5. Payments
You pay your studio, not Keystone. Online payments go to the studio through its own Stripe account, and the studio is the merchant. Keystone doesn't charge families, doesn't receive or hold your payments, and never sees or stores full card numbers. Questions about fees and refunds go to your studio. If you think the app made a technical error, such as a double charge or a wrong invoice amount, contact your studio or Keystone and we will investigate the app's part in it and help put it right.

### A6. Availability and your rights
We work to keep the app running, but it may sometimes be unavailable, for example during maintenance or a supplier outage. We will describe the app's features accurately. Nothing in these terms excludes, restricts or changes any right or remedy you have under the Australian Consumer Law, or any other right the law gives you that can't be excluded.

### A7. Changes to these terms
If we make an important change, we will tell you at least 30 days before it starts, in the app and by email, and explain what is changing. If you don't agree, you can close your login before the change starts, and you will still be able to download your accepted agreements and receipts. Until the change starts, the version you accepted applies. We won't use information we already hold for a new purpose that changes how it affects you without asking you first, where the law requires consent. Small changes that don't affect your rights, such as fixing a typo, may be made without notice and are listed in the version history.

### A8. If your studio leaves Keystone, or Keystone stops the app
If your studio closes, stops using Keystone, or its account is suspended, we will tell you. Your studio can export its records and must keep or delete them under its own privacy policy. You can still ask Keystone for a copy of your own information and your accepted agreements, ask us to correct it, or close your login. We check your identity first, and we may need to leave out other people's information or talk to the studio about records it is required to keep. If Keystone ever decides to stop providing the app, we will give you at least [number] days' notice and a way to get copies of your information first.

### A9. Closing your login
You can close your login at any time in the app or by contacting us. Closing it does not end your agreement with your studio. Section C8 explains what we keep afterwards and for how long.

### A10. Contact and complaints
Support: ${KEYSTONE_SUPPORT_EMAIL}. Privacy: ${KEYSTONE_PRIVACY_EMAIL}. Section C10 explains how we handle complaints.

### A11. Law
These terms are governed by the law of [State], Australia.

${PRIVACY_NOTICE_MARKDOWN}
## Part D — What you agree to at sign-up

The app shows these terms and the privacy notice in their own box, after your studio's terms and before the button, with this tickbox:

> [ ] I agree to Keystone Music HQ's App terms of use, version ${FAMILY_APP_TERMS_VERSION}, and I have read its Privacy notice.

We record the version, your account email, the date, time, IP address and browser, and email you a copy of the accepted text. The tickbox asks you to agree to the terms of use and to confirm you have read the privacy notice. It does not ask you to consent to everything in the privacy policy. Optional consents (emergency medical, health notes, public media) stay separate and belong to your studio's agreement.
`;
