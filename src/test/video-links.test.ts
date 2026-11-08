import { expect, it } from "vitest";
import { isAllowedVideoLinkUrl, saveContent } from "@/services/library";
import { videoLinksEnabled } from "@/lib/app-settings";

it("feature flag keeps video links off until reviewed", () => {
  expect(videoLinksEnabled).toBe(false);
});

it("hostname validation accepts YouTube and Vimeo only", () => {
  expect(isAllowedVideoLinkUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
  expect(isAllowedVideoLinkUrl("https://youtu.be/abc")).toBe(true);
  expect(isAllowedVideoLinkUrl("https://vimeo.com/123")).toBe(true);
  expect(isAllowedVideoLinkUrl("https://evil.example/video")).toBe(false);
});

it("saveContent refuses video_link while the flag is off", async () => {
  await expect(
    saveContent({
      id: crypto.randomUUID(),
      kind: "video_link",
      title: "Scale demo",
      url: "https://www.youtube.com/watch?v=abc",
    }),
  ).rejects.toThrow();
});
