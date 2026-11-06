import { families, students, studio, teacher } from './data';
import type { CommunityScope } from './community';
import { buildDemoStudentGroups, type SmartGroupKey } from '@/lib/smart-groups';

export type NewsTag = 'news' | 'event' | 'concert' | 'exam' | 'holiday' | 'reminder';
export interface NewsAttachment { id: string; kind: 'image' | 'pdf'; fileName: string; featuresStudentIds: string[]; url?: string; photoAnswered?: boolean }
export interface Announcement {
  id: string; studioId: string; authorMembershipId: string; authorName: string; title: string; body: string;
  tag: NewsTag; audience: { kind: 'studio' | 'my_students' | 'groups' | 'families'; groupIds?: string[]; familyIds?: string[] };
  important: boolean; pinnedUntil?: string; publishAt: string; expiresAt?: string; eventDate?: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived'; attachments: NewsAttachment[]; editedAt?: string;
}
export interface StudentGroup {
  id: string;
  studioId: string;
  name: string;
  studentIds: string[];
  kind?: 'manual' | 'smart';
  smartKey?: SmartGroupKey;
  description?: string;
}
export interface AnnouncementReceipt { announcementId: string; personId: string; seenAt?: string; acknowledgedAt?: string }
export interface NewsMembership { id: string; role: 'owner' | 'admin' | 'teacher'; studentIds: string[]; groupIds: string[] }
export interface NewsNotification { id: string; announcementId: string; personId: string; kind: 'push' | 'email'; title: string; sentAt: string }
export const NEWS_DEMO_NOW = '2026-11-03T16:30:00+11:00';
const groups: StudentGroup[] = buildDemoStudentGroups();
export function seedAnnouncements(): Announcement[] {
  const grade3 = groups.find((group) => group.smartKey === 'grade' && /grade 3/i.test(group.name))?.id ?? 'saturday';
  const entries: Array<Partial<Announcement> & Pick<Announcement, 'title' | 'body' | 'publishAt'>> = [
    { title: 'Studio closed Tue 3 Nov, Melbourne Cup', body: 'The studio is closed for Melbourne Cup Day. Enjoy the public holiday. Lessons return on Wednesday.', tag: 'holiday', pinnedUntil: '2026-11-04T23:59:00+11:00', publishAt: '2026-11-02T16:21:00+11:00', important: true },
    { title: 'End-of-year concert', body: 'Our end-of-year concert is on Sunday 6 December.\nBring your music and invite your family.\nPlease arrive fifteen minutes early.\nThe programme will follow soon.', tag: 'concert', eventDate: '2026-12-06T14:00:00+11:00', publishAt: '2026-11-01T11:00:00+11:00' },
    { title: 'Exam entries close soon', body: 'Please confirm your AMEB exam entry with me this week.', tag: 'exam', audience: { kind: 'groups', groupIds: [grade3] }, publishAt: '2026-10-29T15:00:00+11:00' },
    { title: 'Saturday rehearsal', body: 'Saturday students will practise their concert introductions together.', tag: 'event', audience: { kind: 'groups', groupIds: ['saturday'] }, publishAt: '2026-10-24T10:00:00+11:00' },
    { title: 'A little practice every day', body: 'Short, regular practice makes a difference. Thank you for supporting your young musicians.', publishAt: '2026-10-16T16:00:00+11:00' },
    { title: 'Welcome to Term 4', body: 'Welcome back! Please bring your books and a pencil to each lesson.', publishAt: '2026-10-02T16:00:00+10:00' },
    { title: 'Concert programme draft', body: 'Programme and running order to review.', status: 'draft', publishAt: NEWS_DEMO_NOW },
    { title: 'Next week’s practice reminder', body: 'Please keep working on your concert pieces this week.', tag: 'reminder', status: 'scheduled', publishAt: '2026-11-09T09:00:00+11:00' },
  ];
  return entries.map((entry, i) => ({ id: `news-${i + 1}`, studioId: studio.id, authorMembershipId: teacher.id, authorName: teacher.name, tag: 'news', audience: { kind: 'studio' }, important: false, status: 'published', attachments: [], ...entry }));
}
type NewsState = { posts: Announcement[]; groups: StudentGroup[]; receipts: AnnouncementReceipt[]; notifications: NewsNotification[]; membership: NewsMembership; now: string };
export const newsState: Record<CommunityScope, NewsState> = {
  demo: { posts: seedAnnouncements(), groups, receipts: families.slice(0, 14).map(f => ({ announcementId: 'news-1', personId: f.guardians[0]?.id ?? '', seenAt: '2026-11-03T10:00:00+11:00' })), notifications: [], membership: { id: teacher.id, role: 'owner', studentIds: students.map(s => s.id), groupIds: groups.map(g => g.id) }, now: NEWS_DEMO_NOW },
  'new-studio': { posts: [], groups: [], receipts: [], notifications: [], membership: { id: 'new-teacher', role: 'owner', studentIds: [], groupIds: [] }, now: NEWS_DEMO_NOW },
};