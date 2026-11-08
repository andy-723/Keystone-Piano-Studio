import { afterEach, expect, it } from "vitest";
import { mockMediaStorage, resetMockMediaStorage } from "@/services/providers/media-storage";

afterEach(() => resetMockMediaStorage());

it("rejects chat video over 50 MB with plain language", async () => {
  await expect(
    mockMediaStorage.createUploadUrl("studio-1", "chat_video", 51 * 1024 * 1024, "video/mp4", 30),
  ).rejects.toThrow("Videos can be up to 60 seconds. Trim it and try again.");
});

it("rejects chat video over 60 seconds", async () => {
  await expect(
    mockMediaStorage.createUploadUrl("studio-1", "chat_video", 1024, "video/mp4", 61),
  ).rejects.toThrow("Videos can be up to 60 seconds. Trim it and try again.");
});

it("confirmUpload rejects mismatched file signature", async () => {
  const { assetId } = await mockMediaStorage.createUploadUrl(
    "studio-1",
    "pdf",
    1024,
    "application/pdf",
  );
  await expect(
    mockMediaStorage.confirmUpload(assetId, new Uint8Array([0xff, 0xd8, 0xff])),
  ).rejects.toThrow("That file type is not allowed.");
});

it("confirmUpload accepts a matching PDF signature", async () => {
  const { assetId } = await mockMediaStorage.createUploadUrl(
    "studio-1",
    "pdf",
    1024,
    "application/pdf",
  );
  await expect(
    mockMediaStorage.confirmUpload(assetId, new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  ).resolves.toEqual({ ok: true });
});
