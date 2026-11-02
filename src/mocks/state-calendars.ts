import { TERMS_2027 } from "@/lib/calendar";
import type { StudioState } from "./setup";
type Term = { name: string; start: string; end: string };
function terms(dates: [string, string][]): Term[] { return dates.map(([start, end], index) => ({ name: `Term ${index + 1}`, start: `2027-${start}`, end: `2027-${end}` })); }
export const STATE_CALENDARS: Record<StudioState, { terms: readonly Term[]; note?: string; source: string }> = {
  VIC: { terms: TERMS_2027, source: "https://www.education.vic.gov.au/Documents/about/department/term-dates.pdf" },
  NSW: { terms: terms([["02-03", "04-09"], ["04-29", "07-02"], ["07-20", "09-24"], ["10-11", "12-17"]]), note: "Eastern Division dates; Western Division starts Term 1 on 10 February.", source: "https://education.nsw.gov.au/schooling/calendars/2027" },
  QLD: { terms: terms([["01-27", "03-25"], ["04-12", "06-25"], ["07-12", "09-17"], ["10-05", "12-10"]]), source: "https://education.qld.gov.au/about-us/calendar/future-dates" },
  SA: { terms: terms([["01-27", "04-09"], ["04-26", "07-02"], ["07-19", "09-24"], ["10-11", "12-10"]]), source: "https://www.education.sa.gov.au/parents-and-families/term-dates-south-australian-state-schools" },
  WA: { terms: terms([["02-01", "04-09"], ["04-26", "07-02"], ["07-19", "09-24"], ["10-11", "12-16"]]), source: "https://www.education.wa.edu.au/future-term-dates" },
  TAS: { terms: terms([["02-04", "04-09"], ["04-26", "07-02"], ["07-19", "09-24"], ["10-11", "12-16"]]), source: "https://www.decyp.tas.gov.au/learning/term-dates/" },
  ACT: { terms: terms([["02-01", "04-09"], ["04-28", "07-02"], ["07-20", "09-24"], ["10-12", "12-17"]]), note: "New students start 1 February; continuing students return 2 February.", source: "https://www.act.gov.au/__data/assets/pdf_file/0005/2827589/ACT-school-term-dates-2026-30-web-print-friendly.pdf" },
  NT: { terms: terms([["01-27", "04-02"], ["04-13", "06-18"], ["07-13", "09-17"], ["10-05", "12-09"]]), source: "https://nt.gov.au/learning/primary-and-secondary-students/school-term-dates-in-nt" },
};