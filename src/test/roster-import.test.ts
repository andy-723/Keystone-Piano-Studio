import { afterEach, expect, it } from 'vitest';
import sample from '@/mocks/sample-roster.csv?raw';
import { parseRoster, guessMapping, mapRoster, groupSiblings, validateRoster, parseLessonTime } from '@/lib/roster-import';
import { confirmRosterImport, getImportContext, inviteImportedFamilies } from '@/services/roster-import';
import { newStudioRoster, importBatches } from '@/mocks/roster-import';
import { families, students, messages, conversations, weeklySlots } from '@/mocks/data';
const lengths = { families: families.length, students: students.length, messages: messages.length, conversations: conversations.length, slots: weeklySlots.length };
const sampleRows = () => { const parsed = parseRoster(sample); return mapRoster(parsed, guessMapping(parsed.headers)); };
afterEach(() => { for (const value of Object.values(newStudioRoster)) value.splice(0); importBatches.clear(); families.splice(lengths.families); students.splice(lengths.students); messages.splice(lengths.messages); conversations.splice(lengths.conversations); weeklySlots.splice(lengths.slots); });
it('parses CSV quotes, embedded newlines, BOM and spreadsheet tabs', () => {
  expect(parseRoster('\uFEFFName,Notes\r\n"Ada, Wu","Line 1\nLine 2"\r\n').rows).toEqual([['Ada, Wu', 'Line 1\nLine 2']]);
  expect(parseRoster('First Name\tSurname\nAda\tWu\n').rows).toEqual([['Ada', 'Wu']]);
  expect(() => parseRoster('Name,Email\nAda')).toThrow('columns');
});
it('guesses friendly header names and allows revised mappings', () => {
  expect(guessMapping(['First Name', 'Surname', 'Email'])).toMatchObject({ student_first_name: 0, student_last_name: 1, guardian_email: 2 });
  const parsed = parseRoster('A,B\nWu,Ada'); const mapping = guessMapping(parsed.headers); mapping.student_first_name = 1; mapping.student_last_name = 0;
  expect(mapRoster(parsed, mapping)[0]).toMatchObject({ student_first_name: 'Ada', student_last_name: 'Wu' });
});
it('sample has 12 rows with exactly two errors and one duplicate', () => {
  const rows = sampleRows(); const checks = validateRoster(rows);
  expect(rows).toHaveLength(12); expect(checks.filter((row) => row.status === 'Needs a fix')).toHaveLength(2); expect(checks.filter((row) => row.status === 'Duplicate')).toHaveLength(1);
  expect(checks[5]?.problems).toHaveProperty('lesson_time'); expect(checks[6]?.problems).toHaveProperty('guardian_email');
});
it('groups siblings by guardian email irrespective of case or spaces', () => {
  const rows = sampleRows().slice(0, 2); const sibling = rows[1]; if (!sibling) throw new Error('Missing sibling fixture'); sibling.guardian_email = ' SAM.BROOKS@EXAMPLE.COM ';
  expect(groupSiblings(rows)).toHaveLength(1); expect(groupSiblings(rows)[0]).toHaveLength(2);
});
it('validates times without interpreting 4.30 as a time', () => {
  expect(parseLessonTime('4.30')).toBeNull(); expect(parseLessonTime('4:30 pm')).toBe('16:30'); expect(parseLessonTime('12:00 am')).toBe('00:00'); expect(parseLessonTime('16:30')).toBe('16:30'); expect(parseLessonTime('24:00')).toBeNull();
});
it('validates language, birth year, day and configured lesson lengths', () => {
  const first = sampleRows()[0]; if (!first) throw new Error('Missing sample fixture');
  const row = { ...first, preferred_language: 'fr', birth_year: '2028', lesson_day: 'Someday', lesson_length_min: '90' };
  expect(Object.keys(validateRoster([row])[0]?.problems ?? {})).toEqual(expect.arrayContaining(['preferred_language', 'birth_year', 'lesson_day', 'lesson_length_min']));
});
it('commits isolated new-studio students and invites once into isolated chat only', async () => {
  const rows = sampleRows().slice(0, 2);
  const result = await confirmRosterImport('new-studio', rows, 'new-batch');
  expect(result.students).toHaveLength(2); expect(result.families).toHaveLength(1);
  await confirmRosterImport('new-studio', rows, 'new-batch'); expect(newStudioRoster.students).toHaveLength(2);
  expect((await getImportContext('new-studio')).existingKeys).toHaveLength(2);
  await inviteImportedFamilies('new-batch'); await inviteImportedFamilies('new-batch');
  expect(newStudioRoster.messages).toHaveLength(1); expect(newStudioRoster.conversations).toHaveLength(1);
  expect(students).toHaveLength(lengths.students); expect(messages).toHaveLength(lengths.messages); expect(families).toHaveLength(lengths.families);
});
it('rejects unfixed rows and duplicates at commit', async () => {
  await expect(confirmRosterImport('new-studio', sampleRows(), 'bad')).rejects.toThrow('Fix or remove');
  await confirmRosterImport('new-studio', sampleRows().slice(0, 1), 'one');
  await expect(confirmRosterImport('new-studio', sampleRows().slice(0, 1), 'again')).rejects.toThrow('duplicate');
});
it('demo imports become roster students with weekly slots and one in-app invitation per family', async () => {
  const result = await confirmRosterImport('demo', sampleRows().slice(0, 2), 'demo');
  expect(students.filter((student) => result.studentIds.includes(student.id))).toHaveLength(2);
  expect(weeklySlots.find((slot) => slot.studentId === result.studentIds[0])).toMatchObject({ weekday: 1, time: '15:30', gradeGoal: 'AMEB Grade 1' });
  await inviteImportedFamilies('demo'); await inviteImportedFamilies('demo'); expect(messages).toHaveLength(lengths.messages + 1);
});
