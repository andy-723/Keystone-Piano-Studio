import { saveLiveStudioDetails, studioSnapshot } from "./live/studio-store";
import { communityState, type CommunityScope } from "@/mocks/community";
import { students, teacher, studio } from "@/mocks/data";
import { newStudioRoster } from "@/mocks/roster-import";
import { setupSession } from "@/mocks/setup";
import { getParentSession } from "./parent";
import { respond } from "./_delay";

function validateSubject(id: string, scope: CommunityScope) {
  if (id !== "teacher" && !(scope === "demo" ? students : newStudioRoster.students).some(student => student.id === id)) throw new Error("Student not found.");
}
export async function getProfilePictures(scope: CommunityScope = "demo") { return respond({ ...communityState[scope].photos }); }
export async function setProfilePicture(id: string, image: string | null, scope: CommunityScope = "demo") {
  validateSubject(id, scope);
  if (image && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 7000000)) throw new Error("Choose a JPG, PNG or WebP picture under 5 MB.");
  if (image) communityState[scope].photos[id] = image;
  else delete communityState[scope].photos[id];
  return getProfilePictures(scope);
}
export async function getTeacherProfile(scope: CommunityScope = "demo") {
  return respond(
    scope === "demo"
      ? { name: teacher.name, studioName: studio.name, childSafety: teacher.childSafety ? { ...teacher.childSafety } : undefined }
      : { name: setupSession.studio.teacherName, studioName: setupSession.studio.name, childSafety: undefined },
  );
}
export async function saveTeacherProfile(
  input: {
    name: string;
    studioName: string;
    childSafety?: { state: string; type: string; number: string; expiry: string };
  },
  scope: CommunityScope = "demo",
) {
  const name = input.name.trim(), studioName = input.studioName.trim();
  if (!name || !studioName) throw new Error("Enter your name and studio name.");
  if (scope === "demo") {
    const before = studioSnapshot();
    teacher.name = name;
    studio.name = studioName;
    if (input.childSafety) {
      teacher.childSafety = {
        state: input.childSafety.state.trim(),
        type: input.childSafety.type.trim(),
        number: input.childSafety.number.trim(),
        expiry: input.childSafety.expiry.trim(),
      };
    }
    await saveLiveStudioDetails(before);
  } else {
    setupSession.studio.teacherName = name;
    setupSession.studio.name = studioName;
  }
  return getTeacherProfile(scope);
}
export async function getStudioNews(scope: CommunityScope = "demo") { return respond(communityState[scope].posts.map(post => ({ ...post }))); }
export async function publishStudioNews(input: { title: string; body: string }, scope: CommunityScope = "demo") {
  const title = input.title.trim(), body = input.body.trim();
  if (!title || !body) throw new Error("Add a title and an update before publishing.");
  const profile = await getTeacherProfile(scope);
  const post = { id: crypto.randomUUID(), title, body, authorName: profile.name || "Teacher", createdAt: new Date().toISOString() };
  communityState[scope].posts.unshift(post);
  return respond({ ...post });
}
export async function deleteStudioNews(id: string, scope: CommunityScope = "demo") {
  const posts = communityState[scope].posts;
  const index = posts.findIndex(post => post.id === id);
  if (index < 0) throw new Error("Update not found.");
  posts.splice(index, 1);
  return getStudioNews(scope);
}
export async function getFamilyNews() { await getParentSession(); return getStudioNews("demo"); }