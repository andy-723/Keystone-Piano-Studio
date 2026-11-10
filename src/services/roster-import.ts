import { families, students, weeklySlots, lessonTypes, teacher } from '@/mocks/data';
import { newStudioRoster, importBatches, type ImportScope } from '@/mocks/roster-import';
import { setupSession } from '@/mocks/setup';
import { familyKey, groupSiblings, studentKey, validateRoster, parseLessonTime, lessonWeekday, type ImportRow } from '@/lib/roster-import';
import { getOrCreateFamilyConversation, sendMessage } from './chat';
import { respond } from './_delay';
import type { Family, Lang, LessonType, Student, WeeklySlot } from '@/mocks/types';
import { insertLiveFamily, insertLiveStudents, newRecordId, saveLiveStudioDetails } from './live/studio-store';
import { isLiveStudio } from '@/lib/studio-workspace';
function store(scope: ImportScope) { return scope === 'demo' ? { families, students, weeklySlots, lessonTypes } : newStudioRoster; }
export async function getImportContext(scope: ImportScope) {
  const data = store(scope);
  const durations = scope === 'demo' ? lessonTypes.map((lesson) => lesson.durationMin) : setupSession.lessons.map((lesson) => lesson.durationMin);
  return respond({ durations, existingKeys: data.students.flatMap((student) => {
    const family = data.families.find((entry) => entry.id === student.familyId);
    return (family?.guardians ?? []).map((guardian) => studentKey({ student_first_name: student.firstName, student_last_name: student.lastName, birth_year: String(student.birthYear), guardian_email: guardian.email }));
  }), familyEmails: data.families.flatMap((family) => family.guardians.map((guardian) => familyKey(guardian.email))) });
}
export async function confirmRosterImport(scope: ImportScope, rows: ImportRow[], batchId: string) {
  const existing = importBatches.get(batchId);
  if (existing) { if (existing.scope !== scope) throw new Error('This import belongs to another studio.'); return getImportResult(batchId); }
  const context = await getImportContext(scope);
  const checks = validateRoster(rows, context.existingKeys, context.durations);
  if (!rows.length || checks.some((check) => check.status !== 'Ready')) throw new Error('Fix or remove every problem and duplicate before adding students.');
  const data = store(scope); const studentIds: string[] = []; const familyIds: string[] = [];
  // Live studio: build the whole import first, save it to Supabase, then show it.
  const live = scope === 'demo' && isLiveStudio();
  const newFamilies: Family[] = []; const newStudents: Student[] = [];
  const pending = { families: [...data.families], students: [] as Student[], weeklySlots: [] as WeeklySlot[], lessonTypes: [] as LessonType[] };
  for (const siblings of groupSiblings(rows)) {
    const first = siblings[0]; if (!first) continue;
    let family = pending.families.find((entry) => entry.guardians.some((guardian) => familyKey(guardian.email) === familyKey(first.guardian_email)));
    if (!family) {
      const id = newRecordId('import-family');
      family = { id, displayName: `${first.student_last_name} family`, guardians: [{ id: newRecordId('import-guardian'), name: first.guardian_name.trim(), email: familyKey(first.guardian_email), mobile: first.guardian_mobile.trim(), preferredLanguage: first.preferred_language as Lang }] };
      pending.families.push(family); newFamilies.push(family);
    }
    familyIds.push(family.id);
    for (const row of siblings) {
      const id = newRecordId('import-student');
      const duration = Number(row.lesson_length_min);
      let lessonType = [...data.lessonTypes, ...pending.lessonTypes].find((entry) => entry.durationMin === duration);
      if (!lessonType) {
        const configured = setupSession.lessons.find((entry) => entry.durationMin === duration);
        lessonType = { id: `import-lesson-${duration}`, name: `${duration} min lesson`, durationMin: duration, priceCents: configured?.priceCents ?? 0 };
        pending.lessonTypes.push(lessonType);
      }
      const student: Student = { id, familyId: family.id, firstName: row.student_first_name.trim(), lastName: row.student_last_name.trim(), birthYear: Number(row.birth_year), ...(row.grade_goal.trim() ? { gradeGoal: row.grade_goal.trim() } : {}) };
      pending.students.push(student); newStudents.push(student);
      pending.weeklySlots.push({ studentId: id, weekday: lessonWeekday(row.lesson_day), time: parseLessonTime(row.lesson_time) ?? '', lessonTypeId: lessonType.id, gradeGoal: row.grade_goal.trim() });
      studentIds.push(id);
    }
  }
  if (live) {
    for (const family of newFamilies) await insertLiveFamily(family);
    await insertLiveStudents(newStudents);
  }
  data.families.push(...newFamilies);
  data.students.push(...pending.students);
  data.weeklySlots.push(...pending.weeklySlots);
  data.lessonTypes.push(...pending.lessonTypes);
  // New lesson lengths become part of the studio's saved lesson prices.
  if (live && pending.lessonTypes.length) await saveLiveStudioDetails();
  importBatches.set(batchId, { scope, studentIds, familyIds, invitedFamilyIds: [] });
  return getImportResult(batchId);
}
export async function getImportResult(batchId: string) {
  const batch = importBatches.get(batchId); if (!batch) throw new Error('Import not found.');
  const data = store(batch.scope);
  return respond({ ...batch, batchId, students: data.students.filter((student) => batch.studentIds.includes(student.id)), families: data.families.filter((family) => batch.familyIds.includes(family.id)), messages: batch.scope === 'new-studio' ? newStudioRoster.messages.filter((message) => newStudioRoster.conversations.some((conv) => batch.familyIds.includes(conv.familyId) && conv.id === message.conversationId)).map((message) => ({ ...message, familyName: newStudioRoster.families.find((family) => family.id === newStudioRoster.conversations.find((conv) => conv.id === message.conversationId)?.familyId)?.displayName ?? 'Family chat' })) : [] });
}
export async function inviteImportedFamilies(batchId: string) {
  const batch = importBatches.get(batchId); if (!batch) throw new Error('Import not found.');
  const data = store(batch.scope);
  for (const id of batch.familyIds) {
    if (batch.invitedFamilyIds.includes(id)) continue;
    const family = data.families.find((entry) => entry.id === id); if (!family) continue;
    const body = family.guardians[0]?.preferredLanguage === 'zh-CN' ? '欢迎加入 Keystone Music HQ！您的家庭邀请已发送。请在此聊天中与老师联系。' : 'Welcome to Keystone Music HQ! Your family invitation has been sent. You can stay in touch with your teacher here in family chat.';
    if (batch.scope === 'demo') {
      const conversation = await getOrCreateFamilyConversation(id);
      await sendMessage({ conversationId: conversation.id, authorName: teacher.name, authorRole: 'teacher', kind: 'text', body });
    } else {
      let conv = newStudioRoster.conversations.find((entry) => entry.familyId === id);
      const sentAt = '2027-03-15T09:00:00+11:00';
      if (!conv) { conv = { id: `new-chat-${crypto.randomUUID()}`, familyId: id, lastMessageAt: sentAt, unreadCount: 0 }; newStudioRoster.conversations.push(conv); }
      newStudioRoster.messages.push({ id: `new-message-${crypto.randomUUID()}`, conversationId: conv.id, authorName: setupSession.studio.teacherName || 'Your teacher', authorRole: 'teacher', kind: 'text', body, sentAt });
    }
    batch.invitedFamilyIds.push(id);
  }
  return getImportResult(batchId);
}
export async function getNewStudioRoster() {
  return respond({ students: newStudioRoster.students.map((student) => ({ ...student, familyName: newStudioRoster.families.find((family) => family.id === student.familyId)?.displayName ?? '', slot: newStudioRoster.weeklySlots.find((slot) => slot.studentId === student.id) })), familyCount: newStudioRoster.families.length, batches: [...importBatches.entries()].filter(([, batch]) => batch.scope === 'new-studio').map(([id, batch]) => ({ id, invited: batch.invitedFamilyIds.length === batch.familyIds.length })), conversations: newStudioRoster.conversations.map((conversation) => ({ ...conversation, familyName: newStudioRoster.families.find((family) => family.id === conversation.familyId)?.displayName, messages: newStudioRoster.messages.filter((message) => message.conversationId === conversation.id) })) });
}
