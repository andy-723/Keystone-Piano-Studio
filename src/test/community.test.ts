import { afterEach, expect, it } from "vitest";
import { communityState } from "@/mocks/community";
import { students, teacher, studio } from "@/mocks/data";
import { getProfilePictures, setProfilePicture, publishStudioNews, getStudioNews, getFamilyNews, deleteStudioNews, saveTeacherProfile } from "@/services/community";
const original = { name: teacher.name, studioName: studio.name };
afterEach(() => { communityState.demo.photos = {}; communityState.demo.posts = []; communityState["new-studio"].photos = {}; communityState["new-studio"].posts = []; teacher.name = original.name; studio.name = original.studioName; });
it("allows student and teacher pictures to be set and removed", async () => {
  const student = students[0]; if (!student) throw new Error("Student fixture missing");
  const image = "data:image/png;base64,aGVsbG8=";
  await setProfilePicture(student.id, image); await setProfilePicture("teacher", image);
  expect((await getProfilePictures())[student.id]).toBe(image);
  expect((await getProfilePictures())["teacher"]).toBe(image);
  await setProfilePicture(student.id, null); expect((await getProfilePictures())[student.id]).toBeUndefined();
});
it("rejects external pictures and students from another studio", async () => {
  await expect(setProfilePicture("teacher", "https://example.com/photo.jpg")).rejects.toThrow();
  const student = students[0]; if (!student) throw new Error("Student fixture missing");
  await expect(setProfilePicture(student.id, null, "new-studio")).rejects.toThrow("Student not found");
});
it("publishes one update to the family feed and removes it for everyone", async () => {
  const post = await publishStudioNews({ title: "Recital", body: "Please bring your music." });
  expect((await getFamilyNews()).map(entry => entry.id)).toContain(post.id);
  await deleteStudioNews(post.id); expect(await getFamilyNews()).toEqual([]);
});
it("isolates new-studio news and pictures from demo families", async () => {
  await publishStudioNews({ title: "New studio", body: "Welcome" }, "new-studio");
  await setProfilePicture("teacher", "data:image/png;base64,aGVsbG8=", "new-studio");
  expect(await getFamilyNews()).toEqual([]); expect(await getProfilePictures()).toEqual({});
  expect(await getStudioNews("new-studio")).toHaveLength(1);
});
it("saves teacher settings and rejects empty news", async () => {
  await saveTeacherProfile({ name: "Andrew", studioName: "Harbour Music" });
  expect(teacher.name).toBe("Andrew"); expect(studio.name).toBe("Harbour Music");
  await expect(publishStudioNews({ title: " ", body: " " })).rejects.toThrow();
  expect(await getStudioNews()).toEqual([]);
});