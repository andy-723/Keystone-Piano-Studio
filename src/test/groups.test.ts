import { afterEach, beforeEach, expect, it } from "vitest";
import { newsState, NEWS_DEMO_NOW } from "@/mocks/news";
import { students, studio } from "@/mocks/data";
import { newStudioRoster } from "@/mocks/roster-import";
import {
  addStudentToGroups,
  createGroup,
  deleteGroup,
  listGroups,
  renameGroup,
  setGroupMembers,
} from "@/services/groups";
import { getNewsOptions, newsCounts, saveAnnouncement } from "@/services/news";
import { setStudioPlan } from "@/services/plans";

const snapshot = structuredClone(newsState);
const plan = studio.plan;
const rosterSnapshot = structuredClone(newStudioRoster);

beforeEach(() => {
  Object.assign(newsState, structuredClone(snapshot));
  newsState.demo.now = NEWS_DEMO_NOW;
  Object.assign(newStudioRoster, structuredClone(rosterSnapshot));
  if (plan) studio.plan = plan;
  else delete studio.plan;
});

afterEach(() => {
  Object.assign(newsState, structuredClone(snapshot));
  Object.assign(newStudioRoster, structuredClone(rosterSnapshot));
  if (plan) studio.plan = plan;
  else delete studio.plan;
});

it("lists editable seed manuals separately from smart grade and competition groups", async () => {
  const listed = await listGroups("demo");
  expect(listed.manual.map((group) => group.id).sort()).toEqual(["beginners", "saturday"]);
  expect(listed.smart.some((group) => group.smartKey === "grade")).toBe(true);
  expect(listed.smart.some((group) => group.smartKey === "competition")).toBe(true);
  expect(listed.manual.every((group) => group.kind === "manual")).toBe(true);
});

it("creates uniquely named groups and rejects blanks", async () => {
  await expect(createGroup("  ")).rejects.toThrow("Enter a group name.");
  const created = await createGroup(" Concert prep ", "Term 4");
  expect(created.name).toBe("Concert prep");
  expect(created.description).toBe("Term 4");
  expect(newsState.demo.membership.groupIds).toContain(created.id);
  await expect(createGroup("concert prep")).rejects.toThrow("already exists");
});

it("renames and replaces members with studio students only", async () => {
  const student = students[0];
  const other = students[1];
  if (!student || !other) throw new Error("Missing students");
  const group = await createGroup("Trio");
  await setGroupMembers(group.id, [student.id, other.id]);
  expect((await listGroups()).manual.find((entry) => entry.id === group.id)?.memberCount).toBe(2);
  await expect(setGroupMembers(group.id, ["missing-student"])).rejects.toThrow("belong to this studio");
  await renameGroup(group.id, "Quartet");
  expect((await listGroups()).manual.find((entry) => entry.id === group.id)?.name).toBe("Quartet");
});

it("adds a student into multiple groups without clearing others", async () => {
  const student = students[2];
  if (!student) throw new Error("Missing student");
  const a = await createGroup("A");
  const b = await createGroup("B");
  await setGroupMembers(a.id, [students[0]!.id]);
  await addStudentToGroups(student.id, [a.id, b.id]);
  const listed = await listGroups();
  expect(listed.manual.find((group) => group.id === a.id)?.studentIds).toEqual(
    expect.arrayContaining([students[0]!.id, student.id]),
  );
  expect(listed.manual.find((group) => group.id === b.id)?.studentIds).toEqual([student.id]);
});

it("archives a group still targeted by a published post, otherwise deletes it", async () => {
  const group = await createGroup("Temporary");
  await setGroupMembers(group.id, [students[0]!.id]);
  await saveAnnouncement({ title: "Hello", body: "Body", audience: { kind: "groups", groupIds: [group.id] } });
  const archived = await deleteGroup(group.id);
  expect("archived" in archived && archived.archived).toBe(true);
  expect((await listGroups()).manual.some((entry) => entry.id === group.id)).toBe(false);
  expect(newsState.demo.groups.find((entry) => entry.id === group.id)?.archived).toBe(true);

  const disposable = await createGroup("Disposable");
  const deleted = await deleteGroup(disposable.id);
  expect(deleted).toEqual({ id: disposable.id, deleted: true });
  expect(newsState.demo.groups.some((entry) => entry.id === disposable.id)).toBe(false);
});

it("lets news target a newly created group", async () => {
  const student = students[3];
  if (!student) throw new Error("Missing student");
  const group = await createGroup("News cohort");
  await setGroupMembers(group.id, [student.id]);
  const post = await saveAnnouncement({
    title: "Cohort note",
    body: "Just for this group",
    audience: { kind: "groups", groupIds: [group.id] },
  });
  expect(newsCounts(post).total).toBe(1);
  const options = await getNewsOptions();
  expect(options.studioGroups.some((entry) => entry.id === group.id)).toBe(true);
});

it("starts a new studio with no manual groups and still computes smart lists", async () => {
  const listed = await listGroups("new-studio");
  expect(listed.manual).toEqual([]);
  expect(listed.smart.every((group) => group.studentIds.length === 0)).toBe(true);
  const created = await createGroup("First group", undefined, "new-studio");
  expect((await listGroups("new-studio")).manual.map((group) => group.id)).toEqual([created.id]);
});

it("restricts Academy teachers to groups they own and students they teach", async () => {
  await setStudioPlan("academy");
  newsState.demo.membership.role = "teacher";
  newsState.demo.membership.studentIds = [students[0]!.id];
  newsState.demo.membership.groupIds = [];
  const owned = await createGroup("Mine");
  expect(owned.ownerMembershipId).toBe(newsState.demo.membership.id);
  await setGroupMembers(owned.id, [students[0]!.id]);
  await expect(setGroupMembers(owned.id, [students[1]!.id])).rejects.toThrow("own students");
  // Seed Saturday is owned by the studio owner membership from fixtures — teacher cannot manage it.
  newsState.demo.groups.find((group) => group.id === "saturday")!.ownerMembershipId = "owner-other";
  await expect(renameGroup("saturday", "Nope")).rejects.toThrow("groups you own");
});
