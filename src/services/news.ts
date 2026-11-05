import { families, students, studio, teacher } from '@/mocks/data';
import { newStudioRoster } from '@/mocks/roster-import';
import { setupSession } from '@/mocks/setup';
import { newsState, type Announcement, type NewsAttachment } from '@/mocks/news';
import type { CommunityScope } from '@/mocks/community';
import { readStudioPlan } from './plans';
import { getParentSession } from './parent';
import { respond } from './_delay';

const clone = <T,>(value: T): T => structuredClone(value);
function roster(scope: CommunityScope) { return scope === 'demo' ? { families, students } : newStudioRoster; }
export function newsNow(scope: CommunityScope = 'demo') { return newsState[scope].now; }
export async function getNewsClock(scope: CommunityScope = 'demo') { return respond(newsNow(scope)); }
function ownedIds(scope: CommunityScope) { return scope === 'new-studio' ? roster(scope).students.map(s => s.id) : newsState[scope].membership.studentIds; }
export function audienceFamilies(post: Announcement, scope: CommunityScope = 'demo') {
  const r = roster(scope);
  if (post.audience.kind === 'studio') return r.families.map(f => f.id);
  if (post.audience.kind === 'families') return r.families.filter(f => post.audience.familyIds?.includes(f.id)).map(f => f.id);
  const ids = post.audience.kind === 'my_students' ? ownedIds(scope) : newsState[scope].groups.filter(g => post.audience.groupIds?.includes(g.id)).flatMap(g => g.studentIds);
  const authorIds = post.audience.kind === 'my_students' ? post.audience.familyIds : undefined;
  return authorIds ?? [...new Set(r.students.filter(s => ids.includes(s.id)).map(s => s.familyId))];
}
export function isVisible(post: Announcement, now: string) {
  return post.status === 'published' && Date.parse(post.publishAt) <= Date.parse(now) && (!post.expiresAt || Date.parse(post.expiresAt) > Date.parse(now));
}
export function isPinned(post: Pick<Announcement, 'pinnedUntil'>, now: string) { return Boolean(post.pinnedUntil && Date.parse(post.pinnedUntil) > Date.parse(now)); }
function sorted(list: Announcement[], scope: CommunityScope) { return [...list].sort((a,b) => Number(isPinned(b,newsNow(scope))) - Number(isPinned(a,newsNow(scope))) || Date.parse(b.publishAt)-Date.parse(a.publishAt)); }
function validateAttachment(attachment: NewsAttachment, scope: CommunityScope) {
  if (!['image','pdf'].includes(attachment.kind)) throw new Error('Choose a photo or PDF.');
  if (attachment.url && !attachment.url.startsWith('blob:')) throw new Error('Attachments must stay within this app.');
  if (attachment.kind === 'image' && !attachment.photoAnswered) throw new Error('Does this photo show a student? Please answer before posting.');
  for (const id of attachment.featuresStudentIds) {
    const student = roster(scope).students.find(s => s.id === id);
    if (!student) throw new Error('Student not found.');
    const family = roster(scope).families.find(f => f.id === student.familyId);
    if (family?.newsPhotoConsent !== true) throw new Error(`${student.firstName}'s family hasn't agreed to photos being shared. Remove the photo or ask them first.`);
  }
}
function validateAudience(post: Announcement, scope: CommunityScope) {
  const state = newsState[scope], r = roster(scope);
  const restricted = readStudioPlan(scope) === 'academy' && state.membership.role === 'teacher';
  if (restricted && post.audience.kind === 'studio') throw new Error('Only the studio owner or admin can post to all families.');
  if (post.audience.kind === 'groups' && (!post.audience.groupIds?.length || post.audience.groupIds.some(id => !state.groups.some(g => g.id === id) || (restricted && !state.membership.groupIds.includes(id))))) throw new Error('Choose your student groups.');
  if (post.audience.kind === 'families') {
    if (!post.audience.familyIds?.length || post.audience.familyIds.some(id => !r.families.some(f => f.id === id) || (restricted && !r.students.some(s => s.familyId === id && ownedIds(scope).includes(s.id))))) throw new Error('Choose families from your own students.');
  }
}
function dispatch(post: Announcement, scope: CommunityScope) {
  const state = newsState[scope];
  const target = audienceFamilies(post,scope);
  for (const family of roster(scope).families.filter(f => target.includes(f.id))) {
    const people = [...family.guardians.map(g => ({ id:g.id, guardian:true })), ...roster(scope).students.filter(s => s.familyId === family.id).map(s => ({ id:s.id, guardian:false }))];
    for (const person of people) for (const kind of person.guardian && post.important ? ['push','email'] as const : ['push'] as const) {
      if (!state.notifications.some(n => n.announcementId === post.id && n.personId === person.id && n.kind === kind)) state.notifications.push({ id:crypto.randomUUID(), announcementId:post.id, personId:person.id, kind, title:`New post from ${post.authorName}: ${post.title}`, sentAt:newsNow(scope) });
    }
  }
}
function releaseScheduled(scope: CommunityScope) {
  for (const post of newsState[scope].posts) if (post.status === 'scheduled' && Date.parse(post.publishAt) <= Date.parse(newsNow(scope)) && (!post.expiresAt || Date.parse(post.expiresAt) > Date.parse(newsNow(scope)))) {
    try { validateAudience(post,scope); post.attachments.forEach(a => validateAttachment(a,scope)); post.status = 'published'; dispatch(post,scope); } catch { /* Withheld until consent and audience are valid. */ }
  }
}
export type AnnouncementInput = Pick<Announcement,'title'|'body'> & Partial<Pick<Announcement,'tag'|'audience'|'important'|'pinnedUntil'|'publishAt'|'expiresAt'|'eventDate'|'status'|'attachments'>>;
export async function saveAnnouncement(input: AnnouncementInput, scope: CommunityScope = 'demo', id?: string) {
  const state = newsState[scope], old = id ? state.posts.find(p => p.id === id) : undefined;
  if (id && (!old || old.authorMembershipId !== state.membership.id)) throw new Error('You can edit only your own posts.');
  const title = input.title.trim(), body = input.body.trim();
  if (!title || !body) throw new Error('Add a title and an update before publishing.');
  const post: Announcement = { id:old?.id ?? crypto.randomUUID(), studioId:scope === 'demo' ? studio.id : 'new-studio', authorMembershipId:state.membership.id, authorName:scope === 'demo' ? teacher.name : setupSession.studio.teacherName || 'Teacher', tag:'news', audience:{kind:'studio'}, important:false, publishAt:newsNow(scope), status:'published', attachments:[], ...old, ...clone(input), title, body };
  for (const date of [post.publishAt,post.pinnedUntil,post.expiresAt,post.eventDate]) if (date && !Number.isFinite(Date.parse(date))) throw new Error('Choose a valid date and time.');
  if (post.status === 'archived') throw new Error('Use Archive to remove a post.');
  if (post.status !== 'draft' && Date.parse(post.publishAt) > Date.parse(newsNow(scope))) post.status = 'scheduled';
  if (post.status === 'scheduled' && Date.parse(post.publishAt) <= Date.parse(newsNow(scope))) post.status = 'published';
  validateAudience(post,scope);
  if (post.audience.kind === 'my_students') post.audience.familyIds = [...new Set(roster(scope).students.filter(s=>ownedIds(scope).includes(s.id)).map(s=>s.familyId))];
  if (post.status !== 'draft') post.attachments.forEach(a => validateAttachment(a,scope));
  if (old?.status === 'published') post.editedAt = newsNow(scope);
  if (old) state.posts[state.posts.indexOf(old)] = post; else state.posts.push(post);
  if (isVisible(post,newsNow(scope))) dispatch(post,scope);
  return respond(clone(post));
}
export async function archiveAnnouncement(id: string, scope: CommunityScope = 'demo') {
  const post = newsState[scope].posts.find(p => p.id === id);
  if (!post || post.authorMembershipId !== newsState[scope].membership.id) throw new Error('You can archive only your own posts.');
  post.status = 'archived'; return respond(clone(post));
}
export function newsCounts(post: Announcement, scope: CommunityScope = 'demo') {
  const target = audienceFamilies(post,scope);
  const receipts = newsState[scope].receipts.filter(r => r.announcementId === post.id);
  const count = (key: 'seenAt'|'acknowledgedAt') => roster(scope).families.filter(f => target.includes(f.id) && [...f.guardians.map(g => g.id), ...roster(scope).students.filter(s => s.familyId === f.id).map(s => s.id)].some(id => receipts.some(r => r.personId === id && r[key]))).length;
  return { total:target.length, seen:count('seenAt'), acknowledged:count('acknowledgedAt') };
}
export async function getAnnouncements(scope: CommunityScope = 'demo') { releaseScheduled(scope); return respond(sorted(newsState[scope].posts,scope).map(p => ({ ...clone(p), ...newsCounts(p,scope), pinned:isPinned(p,newsNow(scope)), own:p.authorMembershipId === newsState[scope].membership.id }))); }
export async function getNewsOptions(scope: CommunityScope = 'demo') {
  const state = newsState[scope], r = roster(scope), restricted = readStudioPlan(scope) === 'academy' && state.membership.role === 'teacher';
  return respond({ now:newsNow(scope), studioWide:!restricted, groups:clone(state.groups.filter(g => !restricted || state.membership.groupIds.includes(g.id))), families:r.families.filter(f => !restricted || r.students.some(s => s.familyId === f.id && ownedIds(scope).includes(s.id))).map(f => ({id:f.id,name:f.displayName})), students:r.students.filter(s => !restricted || ownedIds(scope).includes(s.id)).map(s => ({id:s.id,name:`${s.firstName} ${s.lastName}`})) });
}
export type FamilyAnnouncement = Pick<Announcement,'id'|'title'|'body'|'authorName'|'tag'|'publishAt'|'eventDate'|'editedAt'|'pinnedUntil'> & { attachments: Array<Pick<NewsAttachment,'id'|'kind'|'fileName'|'url'>>; seen: boolean; acknowledged: boolean; pinned: boolean };
export async function getNewsForPerson(personId: string, scope: CommunityScope = 'demo'): Promise<FamilyAnnouncement[]> {
  releaseScheduled(scope);
  const family = roster(scope).families.find(f => f.guardians.some(g => g.id === personId) || roster(scope).students.some(s => s.id === personId && s.familyId === f.id));
  if (!family) throw new Error('Family not found.');
  return respond(sorted(newsState[scope].posts.filter(p => isVisible(p,newsNow(scope)) && audienceFamilies(p,scope).includes(family.id)),scope).map(p => {
    const receipt = newsState[scope].receipts.find(r => r.announcementId === p.id && r.personId === personId);
    return { id:p.id,title:p.title,body:p.body,authorName:p.authorName,tag:p.tag,publishAt:p.publishAt,...(p.eventDate ? {eventDate:p.eventDate} : {}),...(p.editedAt ? {editedAt:p.editedAt} : {}),...(p.pinnedUntil ? {pinnedUntil:p.pinnedUntil} : {}),pinned:isPinned(p,newsNow(scope)), attachments:p.attachments.map(a => ({id:a.id,kind:a.kind,fileName:a.fileName,...(a.url ? {url:a.url} : {})})),seen:Boolean(receipt?.seenAt),acknowledged:Boolean(receipt?.acknowledgedAt) };
  }));
}
export async function getParentNews() { const {guardian} = await getParentSession(); return getNewsForPerson(guardian.id); }
export async function recordNewsReceipt(id: string, acknowledge = false) {
  const {guardian} = await getParentSession();
  if (!(await getNewsForPerson(guardian.id)).some(p => p.id === id)) throw new Error('Post not found.');
  let receipt = newsState.demo.receipts.find(r => r.announcementId === id && r.personId === guardian.id);
  if (!receipt) { receipt = {announcementId:id,personId:guardian.id}; newsState.demo.receipts.push(receipt); }
  receipt.seenAt ??= newsNow(); if (acknowledge) receipt.acknowledgedAt ??= newsNow();
  return respond(clone(receipt));
}
export async function getNewsNotifications(scope: CommunityScope = 'demo') { releaseScheduled(scope); return respond(clone(newsState[scope].notifications)); }