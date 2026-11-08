import { MEDIA_LIMITS, plainLanguageLimitError, type MediaKind } from "@/lib/media-limits";

export type MediaAsset = {
  id: string;
  studioId: string;
  kind: MediaKind;
  mime: string;
  bytes: number;
  /** First bytes captured at confirm time (mock). */
  head?: Uint8Array;
  confirmed: boolean;
};

export interface MediaStorage {
  createUploadUrl(
    studioId: string,
    kind: MediaKind,
    bytes: number,
    mime: string,
    durationSeconds?: number,
  ): Promise<{ uploadUrl: string; assetId: string }>;
  confirmUpload(assetId: string, headBytes?: Uint8Array): Promise<{ ok: true }>;
  createReadUrl(assetId: string, ttlSeconds: number): Promise<{ url: string; expiresAt: string }>;
}

const assets = new Map<string, MediaAsset>();

/** Magic-number checks for common MIME types (mock). */
function signatureMatchesMime(head: Uint8Array, mime: string): boolean {
  if (head.length < 4) return false;
  if (mime === "application/pdf") {
    return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
  }
  if (mime === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8;
  if (mime === "image/png") {
    return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  }
  if (mime.startsWith("video/") || mime.startsWith("audio/") || mime.startsWith("image/")) {
    // Mock accepts non-empty head for other allowed types; live path reads Storage bytes.
    return head.length > 0;
  }
  return false;
}

/**
 * Mock MediaStorage. Live version: create signed upload URLs into studio-media /
 * studio-docs; confirmUpload reads the first bytes from Storage and deletes the
 * object if the signature does not match the declared MIME type.
 */
export const mockMediaStorage: MediaStorage = {
  async createUploadUrl(studioId, kind, bytes, mime, durationSeconds) {
    const limits = MEDIA_LIMITS[kind];
    if (!(limits.mimeTypes as readonly string[]).includes(mime)) {
      throw new Error(plainLanguageLimitError(kind, "mime"));
    }
    if (bytes > limits.maxBytes) throw new Error(plainLanguageLimitError(kind, "size"));
    if (
      limits.maxDurationSeconds != null &&
      durationSeconds != null &&
      durationSeconds > limits.maxDurationSeconds
    ) {
      throw new Error(plainLanguageLimitError(kind, "duration"));
    }
    const assetId = crypto.randomUUID();
    assets.set(assetId, { id: assetId, studioId, kind, mime, bytes, confirmed: false });
    return { uploadUrl: `mock://upload/${studioId}/${kind}/${assetId}`, assetId };
  },

  async confirmUpload(assetId, headBytes) {
    const asset = assets.get(assetId);
    if (!asset) throw new Error("Upload not found.");
    const head = headBytes ?? new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    if (!signatureMatchesMime(head, asset.mime)) {
      assets.delete(assetId);
      // Live version deletes the Storage object when the signature does not match.
      throw new Error("That file type is not allowed.");
    }
    asset.head = head;
    asset.confirmed = true;
    return { ok: true as const };
  },

  async createReadUrl(assetId, ttlSeconds) {
    const asset = assets.get(assetId);
    if (!asset?.confirmed) throw new Error("Upload not confirmed.");
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    return { url: `mock://read/${asset.studioId}/${asset.kind}/${assetId}`, expiresAt };
  },
};

export function resetMockMediaStorage() {
  assets.clear();
}
