/**
 * Tax and GST wording shared by Tax Lite, Pro CFO, pricing and help (tax tier review T-01 to T-15, 11 Nov 2026).
 * Draft copy: a registered tax agent and an Australian solicitor settle the final wording.
 */

/** Keystone's own GST status (its operating ABN is not registered for GST as of 11 Nov 2026). */
export const KEYSTONE_GST_REGISTERED = false;

/** Shown beside Keystone's own prices. Prices are always the total price; never "+ GST" (ACCC price display). */
export const KEYSTONE_PRICE_GST_LINE = KEYSTONE_GST_REGISTERED
  ? "Price includes GST."
  : "Keystone is not registered for GST, so no GST is charged.";

/** Every tax screen and every export (T-04). */
export const TAX_DISCLAIMER =
  "Keystone is not a registered tax or BAS agent. Figures are estimates based on your data. Confirm with a registered tax agent.";

/** GST registration test (T-01). */
export const GST_REGISTRATION_RULE =
  "You must register for GST within 21 days of your GST turnover reaching $75,000, counting either the past 12 months or what you expect over the next 12 months. The threshold is the same for sole traders, partnerships, companies and trusts.";

export const GST_ALERT =
  "You may be close to the $75,000 GST registration threshold. If your GST turnover has reached, or is expected to reach, $75,000, you have 21 days to register. Talk to your tax agent.";

/** GST on lessons (T-02). */
export const GST_ON_LESSONS =
  "Private music lessons are a taxable sale. They are not GST-free education. If you are registered, GST applies to your lesson fees and Keystone issues tax invoices to families. Check with your tax agent.";

/** Estimated net GST card (T-07). */
export const NET_GST_NOTE =
  "GST only. Your BAS may also include PAYG withholding, PAYG instalments and other amounts.";

/** Working from home (T-05). */
export const HOME_HOURS_RULE =
  "The ATO fixed rate method (70c per hour) needs a record of the hours you actually worked from home, kept at the time. Scheduled lessons are pre-filled but are not counted until you confirm them. Add admin time as you go.";

export const PLACE_OF_BUSINESS_PROMPT =
  "Do students or parents come to your home studio? If so, your home may be a place of business. That can change what you can claim and may have capital gains tax consequences. Talk to your tax agent.";

/** Cents per km (T-15). 2026–27 rate per the 11 Nov 2026 review; not re-checked against ato.gov.au here. */
export const CENTS_PER_KM_RATE = 91;
export const CENTS_PER_KM_CAP_KM = 5000;
export const CENTS_PER_KM_NOTE =
  "Sole traders can use the cents per kilometre method (91c per km for 2026–27, up to 5,000 business km) or a 12-week logbook. Companies cannot use the cents per kilometre method.";

/** On-charged costs (T-09). */
export const PASS_ON_LABEL =
  "Pass this cost on to the family (added to their next invoice; recorded as income, with your cost recorded as an expense)";
export const PASS_ON_NOTE =
  "Books, exam fees and other costs passed on to families are income when charged to the family, and the original cost is a deduction. Keystone records both so they offset. If your studio is registered for GST, GST may apply to the amount you on-charge.";

/** Stripe fees (T-06) and surcharges (T-10). */
export const STRIPE_FEE_LABEL = "Stripe fees (actual, as reported by Stripe)";
export const NO_SURCHARGE_NOTE =
  "Card surcharges are not available. Card surcharges are banned in Australia from 1 October 2026. Stripe fees are recorded as a business expense.";

/** Teacher remittance (T-08). */
export const SUPER_NOTE =
  "Super indicator only. Worker classification and super obligations are your responsibility. If you pay a contractor mainly for their labour, you may need to pay super for them. From 1 July 2026, super must be paid within 7 business days of each payday (Payday Super). Check with your tax agent.";

/** Export review step (T-04). */
export const EXPORT_REVIEW_LABEL =
  "I have reviewed these figures. Keystone records what I enter and does not decide whether an item is deductible.";

/** At-risk students (T-13). */
export const AT_RISK_NOTE =
  "Based on attendance and practice logins only. Use this as a prompt to talk with the family. It is not a decision about the student.";

/** Xero (T-12, T-14). */
export const XERO_DISCLOSURE =
  "When you connect Xero, Keystone sends your invoices, payments and payout details to your Xero organisation on your instruction. On Xero's Ignite plan, invoices Keystone sends count towards your plan's invoice limit.";
