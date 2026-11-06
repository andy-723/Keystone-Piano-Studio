import { beforeEach, afterEach, expect, it } from 'vitest';
import { newsState, NEWS_DEMO_NOW } from '@/mocks/news';
import { families, students, studio } from '@/mocks/data';
import { getParentSession } from '@/services/parent';
import { saveAnnouncement, getNewsForPerson, getParentNews, recordNewsReceipt, newsCounts, getNewsNotifications, archiveAnnouncement, getNewsOptions } from '@/services/news';
const snapshot=structuredClone(newsState),plan=studio.plan;
beforeEach(()=>{newsState.demo.posts=[];newsState.demo.receipts=[];newsState.demo.notifications=[];newsState.demo.now=NEWS_DEMO_NOW;});
afterEach(()=>{Object.assign(newsState,structuredClone(snapshot));if(plan)studio.plan=plan;else delete studio.plan;});
it('families and students see only their own targeted announcements without audience identities',async()=>{
 const family=families[0],other=families[1],student=students.find(s=>s.familyId===family?.id);if(!family||!other||!student||!family.guardians[0]||!other.guardians[0])throw Error('Missing fixtures');
 const post=await saveAnnouncement({title:'Private',body:'Family update',audience:{kind:'families',familyIds:[family.id]}});
 expect((await getNewsForPerson(family.guardians[0].id)).map(p=>p.id)).toEqual([post.id]);expect(await getNewsForPerson(other.guardians[0].id)).toEqual([]);expect((await getNewsForPerson(student.id))[0]?.id).toBe(post.id);
 expect((await getNewsForPerson(student.id))[0]).not.toHaveProperty('audience');
});
it('scheduled posts stay hidden until next Monday publishAt, then notify once',async()=>{
 const post=await saveAnnouncement({title:'Monday',body:'Reminder',publishAt:'2026-11-09T09:00:00+11:00'});
 expect(post.status).toBe('scheduled');expect(await getParentNews()).toEqual([]);expect(await getNewsNotifications()).toEqual([]);
 newsState.demo.now='2026-11-09T09:00:00+11:00';expect((await getParentNews())[0]?.id).toBe(post.id);const count=(await getNewsNotifications()).length;expect(count).toBeGreaterThan(0);expect((await getNewsNotifications()).length).toBe(count);
});
it('expired and archived posts drop off family feeds',async()=>{
 await saveAnnouncement({title:'Expired',body:'Old',expiresAt:'2026-11-03T10:00:00+11:00'});expect(await getParentNews()).toEqual([]);
 const p=await saveAnnouncement({title:'Archive',body:'Update'});await archiveAnnouncement(p.id);expect(await getParentNews()).toEqual([]);
});
it('blocks a news photo without explicit family photo consent',async()=>{
 const student=students.find(s=>families.find(f=>f.id===s.familyId)?.newsPhotoConsent===false);if(!student)throw Error('Missing nonconsenting student');
 await expect(saveAnnouncement({title:'Photo',body:'Concert',attachments:[{id:'photo',kind:'image',fileName:'photo.png',photoAnswered:true,featuresStudentIds:[student.id]}]})).rejects.toThrow(`${student.firstName}'s family hasn't agreed`);
 expect(newsState.demo.posts).toEqual([]);expect(families.filter(f=>f.newsPhotoConsent===false)).toHaveLength(3);
});
it('seen and acknowledged counts are idempotent family counts',async()=>{
 const post=await saveAnnouncement({title:'Read me',body:'Update'});const {guardian}=await getParentSession();await recordNewsReceipt(post.id,true);await recordNewsReceipt(post.id,true);
 expect(newsCounts(post)).toEqual({total:families.length,seen:1,acknowledged:1});expect(newsState.demo.receipts.filter(r=>r.personId===guardian.id)).toHaveLength(1);
});
it('Academy teachers cannot publish studio-wide or to unrelated families',async()=>{
 studio.plan='academy';newsState.demo.membership.role='teacher';newsState.demo.membership.studentIds=[students[0]?.id??''];
 await expect(saveAnnouncement({title:'All',body:'Update'})).rejects.toThrow('owner or admin');
 const other=families.find(f=>f.id!==students[0]?.familyId);if(!other)throw Error('Missing family');await expect(saveAnnouncement({title:'Other',body:'Update',audience:{kind:'families',familyIds:[other.id]}})).rejects.toThrow('own students');
});
it('Important simulates a push per member and email per guardian, title only',async()=>{
 const family=families[0];if(!family)throw Error('Missing family');const post=await saveAnnouncement({title:'Concert',body:'Private body must never appear',important:true,audience:{kind:'families',familyIds:[family.id]}});
 const sent=await getNewsNotifications();expect(sent.filter(n=>n.kind==='email')).toHaveLength(family.guardians.length);expect(sent.filter(n=>n.kind==='push')).toHaveLength(family.guardians.length+students.filter(s=>s.familyId===family.id).length);expect(sent.every(n=>n.title===`New post from ${post.authorName}: Concert`)).toBe(true);
});
it('offers smart classifications and studio groups for news audiences', async () => {
  const options = await getNewsOptions();
  expect(options.smartGroups.some((group) => group.smartKey === 'grade')).toBe(true);
  expect(options.smartGroups.some((group) => group.smartKey === 'competition')).toBe(true);
  expect(options.smartGroups.map((group) => group.smartKey).sort()).toEqual(
    expect.arrayContaining(['competition', 'grade']),
  );
  expect(options.studioGroups.some((group) => group.id === 'saturday')).toBe(true);
  expect(options.studioGroups.some((group) => group.id === 'beginners')).toBe(true);
  const competition = options.smartGroups.find((group) => group.smartKey === 'competition');
  if (!competition) throw Error('Missing competition classification');
  const post = await saveAnnouncement({ title: 'Exam call', body: 'Bring your music', audience: { kind: 'groups', groupIds: [competition.id] } });
  expect(newsCounts(post).total).toBeGreaterThan(0);
  expect(newsCounts(post).total).toBe(competition.familyCount);
});
