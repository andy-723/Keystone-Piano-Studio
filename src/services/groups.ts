import { deleteLiveGroup, saveLiveGroup } from "./live/news-store";
import { studio } from "@/mocks/data";
import { newsState, type StudentGroup } from "@/mocks/news";
import type { CommunityScope } from "@/mocks/community";
import { annotateGroup, annotateGroups, computeSmartGroups } from "@/lib/smart-groups";
import { newStudioRoster } from "@/mocks/roster-import";
import { families, students } from "@/mocks/data";
import { readStudioPlan } from "./plans";
import { respond } from "./_delay";

const clone = <T,>(value: T): T => structuredClone(value);

function roster(scope: CommunityScope) {
  return scope === "demo" ? { families, students } : newStudioRoster;
}

function studioId(scope: CommunityScope) {
  return scope === "demo" ? studio.id : "new-studio";
}

function membership(scope: CommunityScope) {
  return newsState[scope].membership;
}

function isAcademyTeacher(scope: CommunityScope) {
  return readStudioPlan(scope) === "academy" && membership(scope).role === "teacher";
}

function ownedStudentIds(scope: CommunityScope) {
  return scope === "new-studio" ? roster(scope).students.map((s) => s.id) : membership(scope).studentIds;
}

function assertCanManageManual(group: StudentGroup, scope: CommunityScope) {
  if (group.kind === "smart") throw new Error("Smart classifications update themselves from the roster.");
  if (group.archived) throw new Error("This group is archived.");
  if (isAcademyTeacher(scope) && group.ownerMembershipId !== membership(scope).id) {
    throw new Error("You can only manage groups you own.");
  }
}

function assertStudentsInStudio(studentIds: string[], scope: CommunityScope) {
  const allowed = new Set(roster(scope).students.map((s) => s.id));
  const owned = new Set(ownedStudentIds(scope));
  const restricted = isAcademyTeacher(scope);
  for (const id of studentIds) {
    if (!allowed.has(id)) throw new Error("Students must belong to this studio.");
    if (restricted && !owned.has(id)) throw new Error("You can only add your own students.");
  }
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function assertUniqueName(name: string, scope: CommunityScope, exceptId?: string) {
  const clash = newsState[scope].groups.find(
    (group) =>
      !group.archived &&
      (group.kind ?? "manual") === "manual" &&
      group.id !== exceptId &&
      group.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) throw new Error("A group with this name already exists.");
}

/** Resolve a group id from manual storage or live smart classifications (incl. archived manuals). */
export function resolveGroup(id: string, scope: CommunityScope = "demo"): StudentGroup | undefined {
  const manual = newsState[scope].groups.find((group) => group.id === id);
  if (manual) return manual;
  return computeSmartGroups(scope).find((group) => group.id === id);
}

export function activeManualGroups(scope: CommunityScope = "demo") {
  const state = newsState[scope];
  const restricted = isAcademyTeacher(scope);
  return state.groups.filter((group) => {
    if (group.archived) return false;
    if ((group.kind ?? "manual") !== "manual") return false;
    if (restricted && group.ownerMembershipId !== state.membership.id && !state.membership.groupIds.includes(group.id)) {
      return false;
    }
    return !restricted || group.ownerMembershipId === state.membership.id || state.membership.groupIds.includes(group.id);
  });
}

export async function listGroups(scope: CommunityScope = "demo") {
  const smart = annotateGroups(computeSmartGroups(scope), scope);
  const manual = annotateGroups(activeManualGroups(scope), scope);
  return respond({
    smart,
    manual,
    groups: [...smart, ...manual],
  });
}

export async function createGroup(name: string, description?: string, scope: CommunityScope = "demo") {
  const trimmed = normalizeName(name);
  if (!trimmed) throw new Error("Enter a group name.");
  assertUniqueName(trimmed, scope);
  const member = membership(scope);
  const trimmedDescription = description?.trim();
  const group: StudentGroup = {
    id: crypto.randomUUID(),
    studioId: studioId(scope),
    name: trimmed,
    kind: "manual",
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    studentIds: [],
    ownerMembershipId: member.id,
  };
  if (scope === "demo") await saveLiveGroup(group, true);
  newsState[scope].groups.push(group);
  if (!member.groupIds.includes(group.id)) member.groupIds.push(group.id);
  return respond(annotateGroup(clone(group), scope));
}

export async function renameGroup(groupId: string, name: string, scope: CommunityScope = "demo") {
  const group = newsState[scope].groups.find((entry) => entry.id === groupId);
  if (!group) throw new Error("Group not found.");
  assertCanManageManual(group, scope);
  const trimmed = normalizeName(name);
  if (!trimmed) throw new Error("Enter a group name.");
  assertUniqueName(trimmed, scope, groupId);
  if (scope === "demo") await saveLiveGroup({ ...group, name: trimmed }, false);
  group.name = trimmed;
  return respond(annotateGroup(clone(group), scope));
}

export async function deleteGroup(groupId: string, scope: CommunityScope = "demo") {
  const state = newsState[scope];
  const index = state.groups.findIndex((entry) => entry.id === groupId);
  if (index < 0) throw new Error("Group not found.");
  const group = state.groups[index]!;
  assertCanManageManual(group, scope);
  const referenced = state.posts.some(
    (post) =>
      (post.status === "published" || post.status === "scheduled") &&
      post.audience.kind === "groups" &&
      post.audience.groupIds?.includes(groupId),
  );
  if (referenced) {
    if (scope === "demo") await saveLiveGroup({ ...group, archived: true }, false);
    group.archived = true;
    return respond(annotateGroup(clone(group), scope));
  }
  if (scope === "demo") await deleteLiveGroup(groupId);
  state.groups.splice(index, 1);
  state.membership.groupIds = state.membership.groupIds.filter((id) => id !== groupId);
  return respond({ id: groupId, deleted: true as const });
}

export async function setGroupMembers(groupId: string, studentIds: string[], scope: CommunityScope = "demo") {
  const group = newsState[scope].groups.find((entry) => entry.id === groupId);
  if (!group) throw new Error("Group not found.");
  assertCanManageManual(group, scope);
  const unique = [...new Set(studentIds)];
  assertStudentsInStudio(unique, scope);
  if (scope === "demo") await saveLiveGroup({ ...group, studentIds: unique }, false);
  group.studentIds = unique;
  return respond(annotateGroup(clone(group), scope));
}

export async function addStudentToGroups(studentId: string, groupIds: string[], scope: CommunityScope = "demo") {
  assertStudentsInStudio([studentId], scope);
  const uniqueGroupIds = [...new Set(groupIds)];
  const updated: StudentGroup[] = [];
  for (const groupId of uniqueGroupIds) {
    const group = newsState[scope].groups.find((entry) => entry.id === groupId);
    if (!group) throw new Error("Group not found.");
    assertCanManageManual(group, scope);
    if (!group.studentIds.includes(studentId)) {
      if (scope === "demo") await saveLiveGroup({ ...group, studentIds: [...group.studentIds, studentId] }, false);
      group.studentIds.push(studentId);
    }
    updated.push(clone(group));
  }
  return respond(annotateGroups(updated, scope));
}

export async function getStudentGroups(studentId: string, scope: CommunityScope = "demo") {
  assertStudentsInStudio([studentId], scope);
  const manual = activeManualGroups(scope).filter((group) => group.studentIds.includes(studentId));
  return respond(annotateGroups(manual, scope));
}
