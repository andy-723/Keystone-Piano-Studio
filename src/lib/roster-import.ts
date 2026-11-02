import Papa from 'papaparse';
export const IMPORT_FIELDS = [
  ['student_first_name', 'Student first name'], ['student_last_name', 'Student last name'], ['birth_year', 'Birth year'],
  ['guardian_name', 'Guardian name'], ['guardian_email', 'Guardian email'], ['guardian_mobile', 'Guardian mobile'],
  ['preferred_language', 'Preferred language'], ['lesson_day', 'Lesson day'], ['lesson_time', 'Lesson time'],
  ['lesson_length_min', 'Lesson length (minutes)'], ['grade_goal', 'Grade goal'],
] as const;
export type ImportField = typeof IMPORT_FIELDS[number][0];
export type ImportRow = Record<ImportField, string>;
export type ColumnMapping = Record<ImportField, number>;
export interface ParsedRoster { headers: string[]; rows: string[][] }
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Partial<Record<ImportField, string[]>> = {
  student_first_name: ['firstname', 'studentfirstname', 'givenname'], student_last_name: ['lastname', 'surname', 'familyname'],
  birth_year: ['yearofbirth', 'birthyear', 'yob'], guardian_name: ['parentname', 'guardian', 'parent'],
  guardian_email: ['email', 'parentemail'], guardian_mobile: ['mobile', 'phone', 'parentmobile'],
  preferred_language: ['language', 'lang'], lesson_day: ['day', 'weekday'], lesson_time: ['time', 'starttime'],
  lesson_length_min: ['duration', 'minutes', 'lessonlength', 'durationmin'], grade_goal: ['grade', 'goal'],
};
export function parseRoster(text: string): ParsedRoster {
  if (!text.trim()) throw new Error('Upload a CSV or paste your spreadsheet first.');
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', delimitersToGuess: [',', '\t', ';'] });
  if (result.errors.some((error) => error.code === 'MissingQuotes')) throw new Error('A quoted cell is unfinished. Check the CSV and try again.');
  const [headers, ...rows] = result.data;
  if (!headers || !rows.length) throw new Error('Include a header row and at least one student.');
  if (rows.some((row) => row.length !== headers.length)) throw new Error('Some rows have a different number of columns. Check commas or paste the spreadsheet again.');
  return { headers: headers.map((value) => value.trim()), rows: rows.map((row) => row.map((value) => value.trim())) };
}
export function guessMapping(headers: string[]): ColumnMapping {
  return Object.fromEntries(IMPORT_FIELDS.map(([field]) => [field, headers.findIndex((header) => [normalise(field), ...(aliases[field] ?? [])].includes(normalise(header)))])) as ColumnMapping;
}
export function mapRoster(parsed: ParsedRoster, mapping: ColumnMapping): ImportRow[] {
  const used = Object.values(mapping).filter((index) => index >= 0);
  if (new Set(used).size !== used.length) throw new Error('Match each spreadsheet column only once.');
  return parsed.rows.map((row) => Object.fromEntries(IMPORT_FIELDS.map(([field]) => [field, row[mapping[field]] ?? ''])) as ImportRow);
}
export function parseLessonTime(value: string): string | null {
  const match = value.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2]); const period = match[3];
  if (minute > 59 || hour > (period ? 12 : 23) || (period && hour < 1)) return null;
  if (period) hour = hour % 12 + (period === 'pm' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
export const LESSON_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const lessonWeekday = (day: string) => LESSON_DAYS.findIndex((entry) => entry.toLowerCase() === day.trim().toLowerCase() || entry.slice(0, 3).toLowerCase() === day.trim().toLowerCase());
export const familyKey = (email: string) => email.trim().toLowerCase();
export const studentKey = (row: Pick<ImportRow, 'student_first_name' | 'student_last_name' | 'birth_year' | 'guardian_email'>) => [row.student_first_name.trim().toLowerCase(), row.student_last_name.trim().toLowerCase(), row.birth_year.trim(), familyKey(row.guardian_email)].join('|');
export interface RowCheck { status: 'Ready' | 'Needs a fix' | 'Duplicate'; problems: Partial<Record<ImportField, string>>; duplicateOf?: number }
export function validateRoster(rows: ImportRow[], existingKeys: string[] = [], durations = [30, 45, 60]): RowCheck[] {
  const seen = new Map<string, number>(existingKeys.map((key) => [key, -1]));
  return rows.map((row, index) => {
    const problems: RowCheck['problems'] = {};
    for (const [field, label] of IMPORT_FIELDS) if (field !== 'guardian_mobile' && !row[field].trim()) problems[field] = `Enter ${label.toLowerCase()}.`;
    if (!/^\d{4}$/.test(row.birth_year) || Number(row.birth_year) < 1900 || Number(row.birth_year) > 2027) problems.birth_year = 'Enter a birth year between 1900 and 2027.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.guardian_email.trim())) problems.guardian_email = 'Enter a guardian email like name@example.com.';
    if (row.guardian_mobile && !/^(?:0\d{9}|\+61\d{9})$/.test(row.guardian_mobile.replace(/[\s()-]/g, ''))) problems.guardian_mobile = 'Enter a 10-digit Australian number, or leave it blank.';
    if (!['en', 'zh-CN'].includes(row.preferred_language)) problems.preferred_language = 'Choose en or zh-CN.';
    if (lessonWeekday(row.lesson_day) < 0) problems.lesson_day = 'Enter a day such as Monday.';
    if (!parseLessonTime(row.lesson_time)) problems.lesson_time = `Lesson time ${row.lesson_time || '(blank)'} isn't a time${/^\d{1,2}\.\d{2}$/.test(row.lesson_time) ? ` — did you mean ${row.lesson_time.replace('.', ':')} pm?` : ' — enter 4:30 pm or 16:30.'}`;
    if (!durations.includes(Number(row.lesson_length_min))) problems.lesson_length_min = `Choose a lesson length of ${durations.join(', ')} minutes.`;
    const key = studentKey(row); const duplicateOf = seen.get(key); if (duplicateOf === undefined) seen.set(key, index);
    return { status: duplicateOf !== undefined ? 'Duplicate' : Object.keys(problems).length ? 'Needs a fix' : 'Ready', problems, duplicateOf };
  });
}
export function groupSiblings(rows: ImportRow[]): ImportRow[][] {
  const groups = new Map<string, ImportRow[]>();
  for (const row of rows) { const key = familyKey(row.guardian_email); groups.set(key, [...(groups.get(key) ?? []), row]); }
  return [...groups.values()];
}
