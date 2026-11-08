/**
 * Australian studio agreement template AU v3 (8 November 2026).
 * Product-final for Keystone Music HQ (owner decision 2026-11-08).
 * Source: Keystone-Studio-Agreement-Template-AU-v3.pdf
 */

export type TermsOptionalSwitch =
  | "online"
  | "inHome"
  | "asyncPro"
  | "exams"
  | "premises"
  | "paymentDiscount"
  | "additional";

export interface LegalClause {
  id: string;
  part: 1 | 2 | 3;
  heading: string;
  body: string;
  optional?: TermsOptionalSwitch;
  material: boolean;
}

export const LEGAL_TEMPLATE_VERSION = "AU-v3";
export const LEGAL_TEMPLATE_EFFECTIVE = "2026-11-08";

export const LEGAL_TEMPLATE_AU: LegalClause[] = [
  // —— Part 1: Studio terms and conditions ——
  {
    id: "p1-parties",
    part: 1,
    heading: "Parties",
    body:
      "This agreement is between **{{studio.legalName}}** trading as **{{studio.tradingName}}**, ABN {{studio.abn}}, of {{studio.address}} (\"the Studio\", \"we\"), and the adult who accepts it (\"you\"). If the student is under 18, you must be their parent or legal guardian. You enter this agreement in your own right, as the client who pays, and the student receives the lessons. If the student is 18 or over and accepts for themselves, \"you\" means the student. A student aged 16 or 17 who pays their own fees needs a parent or guardian to accept as co-signer. The Studio uses Keystone Music HQ software to run enrolments, scheduling, billing and messages. Keystone is not a party to this agreement.\n\n**Contact.** {{studio.email}}, {{studio.phone}}, or the Keystone Music HQ app.",
    material: true,
  },
  {
    id: "p1-billing",
    part: 1,
    heading: "1.1 Billing",
    body:
      "Tuition is billed in advance {{billing.cycle}}. We send each invoice at least {{billing.invoiceLeadDays}} days before the billing period starts. Payment is due by {{billing.dueRule}}.",
    material: true,
  },
  {
    id: "p1-lesson-time",
    part: 1,
    heading: "1.2 Your lesson time",
    body:
      "Your weekly lesson time is held for the student once the invoice for the period is paid. If an invoice is unpaid by its due date, we may offer the time to another student after telling you in writing.",
    material: true,
  },
  {
    id: "p1-paying",
    part: 1,
    heading: "1.3 Paying",
    body:
      "You can pay by {{billing.paymentMethods}}. We don't add a surcharge for card payments.",
    material: true,
  },
  {
    id: "p1-payment-discount",
    part: 1,
    heading: "1.3 Payment-method discount",
    body:
      "If you pay by {{billing.paymentDiscount.method}}, a discount of {{billing.paymentDiscount.amountLabel}} applies. The full price is shown on every invoice, at least as prominently as the discounted price.",
    optional: "paymentDiscount",
    material: true,
  },
  {
    id: "p1-late-fee",
    part: 1,
    heading: "1.4 Late payment",
    body:
      "We will remind you in writing when an invoice is overdue. If it is still unpaid {{billing.lateFeeAfterDays}} days after its due date, a late fee of {{billing.lateFeeLabel}} applies, once per invoice, to cover our administration costs. No interest or other charges are added on top. If it is unpaid {{billing.suspendAfterDays}} days after its due date, we may pause lessons until it is paid, after telling you in writing.",
    material: true,
  },
  {
    id: "p1-fee-changes",
    part: 1,
    heading: "1.5 Fee changes",
    body:
      "We review fees once a year. We will give you at least {{billing.feeNoticeDays}} days' written notice of any fee change, through the app and by email.",
    material: true,
  },
  {
    id: "p1-agreement-changes",
    part: 1,
    heading: "1.6 Changes to this agreement",
    body:
      "If we change fees or any other important term of this agreement, we will tell you what has changed and when the change starts, at least {{billing.feeNoticeDays}} days ahead. You will be asked to accept the new version. If you don't want to accept it, you may end lessons before the change starts by telling us in writing, and you won't have to pay the notice period in clause 7.1. Fees already paid for lessons after your last lesson will be refunded. Until the change starts, or if you don't accept it and haven't ended lessons, the version you last accepted continues to apply.",
    material: true,
  },
  {
    id: "p1-what-fees-pay",
    part: 1,
    heading: "2.1 What fees pay for",
    body:
      "Fees cover the lesson itself, a reserved weekly time in the teacher's schedule, and lesson planning.",
    material: false,
  },
  {
    id: "p1-cancel-notice",
    part: 1,
    heading: "2.2 Telling us about an absence",
    body:
      "To be eligible for a make-up lesson, tell us at least {{policies.cancelNoticeHours}} hours before the lesson through the Keystone Music HQ app or by email to {{studio.email}}.",
    material: true,
  },
  {
    id: "p1-late-notice",
    part: 1,
    heading: "2.3 Late notice and no-shows",
    body:
      "If you give less notice than clause 2.2 requires, or the student doesn't attend without notice, the lesson is forfeited. No refund, credit or make-up is given for it, except where the law requires one.",
    material: true,
  },
  {
    id: "p1-makeups",
    part: 1,
    heading: "2.4 Make-up lessons",
    body:
      "For absences notified on time, we will offer up to {{policies.makeUpQuota}} make-up lesson(s) per {{policies.makeUpPeriod}}, to be used by {{policies.makeUpExpiry}}. Make-ups can't be exchanged for cash, and a booked make-up can't be moved again. If we can't offer you a make-up time before it expires, we will extend it to the next period or credit that lesson on your next invoice.",
    material: true,
  },
  {
    id: "p1-online-alt",
    part: 1,
    heading: "2.5 Online and video alternatives",
    body:
      "If the student can't come in person (for example, mildly unwell, or no transport), they can have the lesson live online through {{policies.onlinePlatform}} at the usual time.",
    material: true,
  },
  {
    id: "p1-async",
    part: 1,
    heading: "2.5 Video lessons (Pro)",
    body:
      "Instead, the student may send practice videos through the app before the lesson time, and the teacher will use the lesson time to record video feedback. {{studio.asyncLessonPolicyLabel}}.",
    optional: "asyncPro",
    material: true,
  },
  {
    id: "p1-teacher-absence",
    part: 1,
    heading: "2.6 Teacher absence",
    body:
      "If the teacher cancels a lesson, you can choose a make-up lesson, a credit on your next invoice, or a refund for that lesson.",
    material: true,
  },
  {
    id: "p1-late-arrival",
    part: 1,
    heading: "2.7 Late arrival",
    body:
      "If the student arrives late, the teacher teaches the time that remains and the lesson ends at the usual time. The lesson is treated as a no-show under clause 2.3 only if the student doesn't arrive, or arrives after more than half the lesson has passed without telling us.",
    material: false,
  },
  {
    id: "p1-public-holidays",
    part: 1,
    heading: "2.8 Public holidays",
    body:
      "Lessons that fall on a public holiday in {{studio.state}} {{policies.publicHolidayRule}}.",
    material: true,
  },
  {
    id: "p1-illness",
    part: 1,
    heading: "3. Illness and hygiene",
    body:
      "3.1 Students with contagious symptoms, such as fever, persistent cough, vomiting, conjunctivitis or an early cold or flu, must not come to an in-person lesson. We will offer an online or video lesson instead under clause 2.5. If the student is too unwell for any lesson, or an online lesson isn't reasonably possible for you, the absence is treated as notified on time and you'll get a make-up or a credit.\n\n3.2 If a student arrives clearly unwell, the teacher may end the in-person lesson. The rest of the lesson is offered online or by video feedback, or as a make-up if neither is possible.\n\n3.3 Students wash or sanitise their hands before using studio instruments and keep fingernails short enough to play properly.",
    material: true,
  },
  {
    id: "p1-online",
    part: 1,
    heading: "4.1 Online lessons",
    body:
      "For online lessons you provide a stable internet connection, a charged device with a working camera and microphone placed so the teacher can see the hands and keyboard, and a quiet room. If a lesson is cut short by a problem on your side, it isn't extended or refunded. If the problem is on our side, or outside either of our control (such as a video platform or internet outage), or we asked for the lesson to be online, we will offer a make-up for any substantial lost time.",
    optional: "online",
    material: false,
  },
  {
    id: "p1-inhome",
    part: 1,
    heading: "4.2 In-home lessons",
    body:
      "When the teacher travels to you, a travel fee of {{services.inHomeTravelFee}} per visit applies. An adult (18+) must be at home for the whole lesson. Please keep pets away from the teaching area and have a tuned, working instrument ready in a quiet room.",
    optional: "inHome",
    material: true,
  },
  {
    id: "p1-materials",
    part: 1,
    heading: "5. Materials, copyright, exams and performances",
    body:
      "5.1 You buy the books, sheet music and accessories the teacher asks for. If the teacher buys them for you, with your agreement, the cost is added to your next invoice.\n\n5.2 Only original or legally bought copies of sheet music are used in lessons and exams.\n\n5.3 Acoustic pianos should be tuned by a qualified technician at least {{policies.tuningFrequency}}. Digital pianos should have 88 full-size, weighted, touch-sensitive keys and a sustain pedal.",
    material: false,
  },
  {
    id: "p1-exams",
    part: 1,
    heading: "5.4 Exams",
    body:
      "The teacher recommends exams (such as {{curriculum.boards}}), competitions and recitals based on the student's readiness. Entry fees, accompanist fees and recital fees are separate from tuition and are paid in advance.",
    optional: "exams",
    material: false,
  },
  {
    id: "p1-child-safety",
    part: 1,
    heading: "6. Child safety and supervision",
    body:
      "6.1 Lessons are planned for the student's scheduled time. Please drop off and collect students on time, because the teacher may be teaching other students before and after, and siblings in the waiting area remain your responsibility. This doesn't reduce the care the teacher takes of any child on the premises.\n\n6.2 Each teacher at the Studio holds the working-with-children check required in their State: {{teacher.childSafetyChecks}}. Check numbers are available to parents on request.\n\n6.3 Parents and guardians are welcome to watch any lesson.",
    material: true,
  },
  {
    id: "p1-premises",
    part: 1,
    heading: "6.4 Studio premises",
    body:
      "In the waiting area please keep noise down, and keep food and drink other than bottled water away from instruments.",
    optional: "premises",
    material: false,
  },
  {
    id: "p1-ending",
    part: 1,
    heading: "7. Ending lessons",
    body:
      "7.1 Your notice. To stop lessons, tell us in writing at least {{billing.noticePeriod}} ahead. You pay for lessons up to the end of the notice period, whether or not the student attends. We first use any fees you have already paid for those lessons, and refund fees paid for any lessons after the notice period ends.\n\n7.2 Our notice. We may end lessons immediately if a student or family member behaves in an abusive or unsafe way. We may end lessons after a written warning if fees remain unpaid. We may also end lessons for any other reason with {{billing.noticePeriod}} written notice, and you may do the same under clause 7.1. In every case, we refund fees paid for lessons not yet given, and you pay nothing for lessons after the arrangement ends.\n\n7.3 Events outside our control. If in-person lessons can't go ahead because of something outside our control, such as a public health order, extreme weather, a power outage or a natural disaster, lessons move online at the usual time. If online lessons aren't possible either, we offer make-ups or a credit. If you can't receive lessons for more than two weeks in a row because of such an event, you may end lessons without the notice period and we will refund unused prepaid fees.",
    material: true,
  },
  {
    id: "p1-additional",
    part: 1,
    heading: "8. Additional studio terms",
    body:
      "{{studio.additionalTerms}}\n\nThese additional terms can't reduce your rights under the Australian Consumer Law or the protections elsewhere in this agreement. If they conflict with the rest of this agreement, the rest of this agreement applies.",
    optional: "additional",
    material: true,
  },

  // —— Part 2: Disclaimer ——
  {
    id: "p2-acl",
    part: 2,
    heading: "Your rights under the Australian Consumer Law",
    body:
      "Our services come with guarantees that cannot be excluded under the Australian Consumer Law, including that they will be provided with due care and skill. Nothing in this agreement excludes, restricts or changes those guarantees or any other right you have that the law says cannot be excluded.",
    material: true,
  },
  {
    id: "p2-progress",
    part: 2,
    heading: "Progress and results",
    body:
      "Learning an instrument depends on regular practice, attendance, family support for younger students, and a suitable instrument. The teacher will teach with care and skill, but we can't promise a particular rate of progress, exam grade, audition result, scholarship or competition placing.",
    material: true,
  },
  {
    id: "p2-health",
    part: 2,
    heading: "Health and injury",
    body:
      "Playing involves repeated fine movements, posture and, for some instruments, breathing. Please tell us about any injury, physical condition or discomfort that could affect playing. The teacher is a music educator, not a medical practitioner or physiotherapist, and advice on posture or technique is teaching advice, not medical advice. If the student feels pain while playing, they should stop and see a health professional.",
    material: true,
  },
  {
    id: "p2-premises-liability",
    part: 2,
    heading: "Premises and belongings",
    body:
      "Please take care on our premises, including driveways, stairs and the waiting area, and supervise children who are not in a lesson. To the extent the law allows, we are not responsible for loss of or damage to personal belongings left on the premises, unless caused by our negligence.",
    optional: "premises",
    material: true,
  },
  {
    id: "p2-damage",
    part: 2,
    heading: "Damage to studio property",
    body:
      "If the student, or someone you bring with you and are responsible for, damages a studio instrument, equipment or property through carelessness or misuse, you agree to pay the reasonable cost of repair. If it can't be repaired, you pay the value of a reasonably equivalent item, allowing for age and wear, and not the cost of a new one. This doesn't apply to normal wear and tear or to damage we caused.",
    material: true,
  },
  {
    id: "p2-liability",
    part: 2,
    heading: "Our liability",
    body:
      "Nothing in this agreement limits your rights under the consumer guarantees, including any right to damages for loss that was reasonably foreseeable.",
    material: true,
  },

  // —— Part 3: Studio privacy policy ——
  {
    id: "p3-privacy-intro",
    part: 3,
    heading: "Studio privacy policy",
    body:
      "We promise to handle your family's personal information consistently with the Australian Privacy Principles, and we take particular care with children's information. If the studio is not covered by the Privacy Act (most small businesses with turnover of A$3 million or less aren't): This is our promise to you under this agreement. If the studio is covered, or has opted in: We are also bound by the Privacy Act 1988.",
    material: true,
  },
  {
    id: "p3-collect",
    part: 3,
    heading: "1. What we collect",
    body:
      "We collect only what we need to teach and run the studio:\n\n- **Contact and identity:** the student's name, birth year and school year level; parent or guardian names, address, email and mobile; emergency contacts.\n- **Learning records:** lesson notes, practice logs, assignments, progress and exam results.\n- **Health and learning needs** (only if you choose to tell us): medical conditions, allergies, physical conditions, or learning or developmental needs that help us teach safely and well. This is sensitive information, and we collect it only with your consent.\n- **Recordings and photos:** audio, video and photos made in or for lessons, for teaching feedback, exam entries, or the student's profile. Public promotional use needs your separate consent.\n- **Payment records:** invoices and payments. Card details are handled by our payment provider, {{privacy.paymentProvider}}. We never see or store full card numbers.\n\nMost information comes from you. If you give us information about another person, such as an emergency contact, please tell them you have done so and point them to this policy.",
    material: true,
  },
  {
    id: "p3-use",
    part: 3,
    heading: "2. How we use it",
    body:
      "To schedule and teach lessons, send invoices and receipts, communicate with you, track progress, keep students safe, and enter exams or events you have asked us to. Teachers may record parts of lessons, or ask for practice videos, to give feedback. Those recordings are seen only by the student's family, teachers and studio administrators. We don't sell, rent or trade personal information, and we don't use it for advertising.",
    material: true,
  },
  {
    id: "p3-share",
    part: 3,
    heading: "3. Who we share it with",
    body:
      "Only:\n\n- Exam boards and event organisers such as {{curriculum.boards}}, when you have asked us to enter the student;\n- Emergency services, if a student needs urgent medical help;\n- Our software and service providers, who handle information on our behalf under contract (below);\n- Anyone the law requires us to tell, including under child protection laws.",
    material: true,
  },
  {
    id: "p3-storage",
    part: 3,
    heading: "4. Software, storage and overseas providers",
    body:
      "We use Keystone Music HQ to store and manage records. {{privacy.keystoneStorageStatement}} Before sharing information with an overseas provider, Keystone puts contract terms in place with it that require the information to be protected. If connected: our payment provider is {{privacy.paymentProvider}} and our accounting software is {{privacy.accountingSoftware}}. We have our own agreements with them.",
    material: true,
  },
  {
    id: "p3-security",
    part: 3,
    heading: "5. Security and access",
    body:
      "Records are kept in password-protected systems with access limited to the people who need them. Within the studio, health and learning notes are visible only to the student's teachers and studio administrators, and they aren't included in emails or app notifications. Keystone's support staff can see records only if the studio approves a time-limited access grant, which is logged. In an emergency, such as a security incident or a risk to someone's safety, Keystone's founder or a named backup may access records without that approval. That access is limited to what the emergency needs, logged and reviewed, and the studio is told within 24 hours. If a data breach is likely to cause you serious harm, we will tell you as soon as practicable. Where the law requires, we will also tell the Office of the Australian Information Commissioner.",
    material: true,
  },
  {
    id: "p3-retention",
    part: 3,
    heading: "6. How long we keep it",
    body:
      "We keep financial records for {{privacy.financialRetentionYears}} years, as the law requires for our type of business (5 years for most sole traders, 7 years for companies). We delete or de-identify other personal information {{policies.inactiveRetentionMonths}} months after a student stops lessons. If you ask us to keep the student's learning records for longer, we keep them for up to 3 more years and then delete them. We may keep records longer only while they are needed for a dispute, a legal requirement, or a child-safety or incident matter, and only the records that matter needs.",
    material: true,
  },
  {
    id: "p3-rights",
    part: 3,
    heading: "7. Your choices and rights",
    body:
      "You can ask to see or correct your family's information, ask us to delete information we no longer need, or withdraw a consent at any time, in the app or by emailing {{studio.privacyEmail}}. We will reply within 30 days. Withdrawing media consent applies to future use: we will remove what we control, but we can't recall copies others have already shared, and group photos may stay up if other students appear in them. When a student turns 18, they control their own records and their parent's access ends unless the student agrees. Adult students have these rights themselves.",
    material: true,
  },
  {
    id: "p3-complaints",
    part: 3,
    heading: "8. Complaints",
    body:
      "Please contact us first at {{studio.privacyEmail}}. We'll reply within 30 days. If the studio is covered by the Privacy Act: If you're not satisfied, you can complain to the Office of the Australian Information Commissioner at oaic.gov.au or 1300 363 992. If not covered: The Commissioner can only deal with complaints about businesses covered by the Privacy Act. You can still raise concerns with Keystone at {{privacy.keystonePrivacyEmail}}.",
    material: true,
  },
];

/** Part 4 enrolment screen copy (collection notice + consent prompts). AU v3. */
export const PART4_COLLECTION_NOTICE = {
  title: "Collection notice",
  body:
    "{{studio.tradingName}} collects the details on these screens to enrol {{student.firstName}}, teach them, bill you and keep them safe. They are stored in Keystone Music HQ, the studio's software. Some lesson recordings are made for teaching feedback. We share details only as our privacy policy explains, including with exam boards when you ask us to. Some service providers are overseas: {{privacy.overseasCountriesLabel}}. If you don't give the required details, we can't enrol the student.",
  privacyLinkLabel: "Read the privacy policy",
};

export const PART4_EMERGENCY_MEDICAL = {
  title: "Emergency medical authorisation",
  prompt:
    "If {{student.firstName}} needs urgent medical help and we can't reach you or the emergency contact straight away, I authorise the Studio to call an ambulance or seek emergency medical help for them, and to share their health information with the people treating them. I understand ambulance and medical costs are my responsibility, except where they were caused by the Studio's negligence.",
  yes: "I agree",
  no: "I don't agree",
};

export const PART4_HEALTH_NOTES = {
  title: "Health and learning notes",
  prompt:
    "I agree to the Studio collecting the health and learning information I have entered, to help teach {{student.firstName}} safely. Within the studio, only their teachers and studio administrators can see it. Keystone staff can see it only under the controlled, logged access described in the privacy policy (section 5). I can change or remove it at any time.",
  yes: "I agree",
  no: "Don't keep this information",
};

export const PART4_PUBLIC_MEDIA = {
  title: "Public media consent",
  prompt:
    "May the Studio use photos, audio or video of {{student.firstName}} from lessons or performances on its website, social media or printed promotion? Only first names are used, never surnames or contact details. Recordings for lesson feedback and exam entries are separate and don't need this consent. This consent covers {{student.firstName}}'s image and voice only; the Studio is responsible for any permission needed for the music being played. You can change your answer any time in the app. If you withdraw, we stop new use and remove what we control, but we can't recall copies others have shared.",
  yes: "Yes, I consent",
  no: "No, I don't consent",
  talkFirst: "For students aged 10 and over: Please talk with {{student.firstName}} about this first. We'll also ask them before posting anything of them.",
};

export const PART4_TERMS_ACCEPT = {
  moneyRulesTitle: "Money rules at a glance",
  studioTick:
    "I agree to {{studio.tradingName}}'s Terms and Conditions and Disclaimer, version {{terms.versionNo}}, effective {{terms.effectiveAt}}, and I have read its Privacy Policy.",
  guardianTick:
    "I declare that I am 18 or over and the parent or legal guardian of {{student.firstNames}}. I am entering this agreement as the client.",
  keystoneBoxTitle: "Keystone Music HQ, the app your studio uses",
  keystoneTick:
    "I agree to Keystone Music HQ's App terms of use, version {{terms.appVersion}}, and I have read its Privacy notice.",
  typedNameLabel: "Full name",
  relationshipLabel: "Relationship to the student",
  relationshipParent: "Parent",
  relationshipGuardian: "Legal guardian",
};

/** Words that trigger a non-blocking warning on studio.additionalTerms. */
export const ADDITIONAL_TERMS_WARNING_WORDS = [
  "surcharge",
  "card fee",
  "admin fee",
  "no refund",
  "non-refundable",
] as const;
