import { describe, expect, it, vi } from 'vitest';
vi.mock('@/services/_delay', () => ({ respond: async <T,>(value: T) => structuredClone(value) }));
import { startEnrolment, getEnrolments } from '@/services/onboarding';

const adult = { firstName: 'Alex', lastName: 'Adult', birthYear: 2009, guardianName: '', guardianEmail: '', guardianMobile: '', studentEmail: 'alex.adult@example.com', studentMobile: '0400000018', language: 'en' as const };
describe('adult enrolment contacts', () => {
  it('allows an 18-year-old to enrol without a guardian using their own contact', async () => {
    const draft = await startEnrolment(adult, 'new-studio');
    const data = await getEnrolments('new-studio');
    const student = data.students.find(entry => entry.id === draft.studentId);
    const family = data.families.find(entry => entry.id === student?.familyId);
    expect(family?.guardians[0]?.name).toBe('Alex Adult');
    expect(family?.guardians[0]?.email).toBe('alex.adult@example.com');
    expect(family?.guardians[0]?.mobile).toBe('0400000018');
  });
  it('allows an older adult to optionally nominate a guardian', async () => {
    const draft = await startEnrolment({ ...adult, birthYear: 1980, guardianName: 'Sam Contact', guardianEmail: 'sam.contact@example.com' }, 'new-studio');
    const data = await getEnrolments('new-studio');
    const student = data.students.find(entry => entry.id === draft.studentId);
    expect(data.families.find(entry => entry.id === student?.familyId)?.guardians[0]?.name).toBe('Sam Contact');
  });
  it('still requires a guardian for a 17-year-old', async () => {
    await expect(startEnrolment({ ...adult, birthYear: 2010 }, 'new-studio')).rejects.toThrow(/guardian/);
  });
  it('does not merge unrelated adults with missing contact emails', async () => {
    await expect(startEnrolment({ ...adult, studentEmail: '' }, 'new-studio')).rejects.toThrow(/email/);
  });
});