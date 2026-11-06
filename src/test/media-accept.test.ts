import { expect, it } from "vitest";
import { isPhoneImageFile, isPhoneVideoFile, mediaKindFromFile } from "@/lib/media-accept";

it("accepts iPhone HEIC photos even when the browser leaves type empty", () => {
  const heic = new File([new Uint8Array([0])], "IMG_001.HEIC", { type: "" });
  expect(isPhoneImageFile(heic)).toBe(true);
  expect(mediaKindFromFile(heic)).toBe("image");
});

it("accepts common phone video containers", () => {
  const mov = new File([new Uint8Array([0])], "practice.MOV", { type: "video/quicktime" });
  expect(isPhoneVideoFile(mov)).toBe(true);
  expect(mediaKindFromFile(mov)).toBe("video");
});
