/**
 * Which data the studio screens use for this browser tab.
 *
 *   mock  local dev / tests without Supabase keys, platform staff, and the demo studio
 *         (studio.is_demo = true). Screens read the in-memory demo fixtures.
 *   live  a real studio. Screens still read through src/services, but the in-memory store
 *         starts empty and is filled from this studio's own Supabase rows (RLS-scoped), and
 *         saves go to Supabase first. See src/services/live/studio-store.ts.
 *
 * Set once per sign-in by LiveAuthGuard before any studio screen mounts.
 */
export type StudioWorkspace =
  | { mode: "mock" }
  | {
      mode: "live";
      studioId: string;
      /** The signed-in person (auth.users id); RLS checks it on what they post. */
      userId: string;
      role: "owner" | "admin" | "teacher" | "guardian";
      /** Guardians only: the signed-in guardian's own row. */
      guardianId?: string;
    };

let current: StudioWorkspace = { mode: "mock" };
let loadedKey: string | null = null;

export function getStudioWorkspace(): StudioWorkspace {
  return current;
}

export function isLiveStudio(): boolean {
  return current.mode === "live";
}

export function liveStudioId(): string | null {
  return current.mode === "live" ? current.studioId : null;
}

export function workspaceKey(workspace: StudioWorkspace): string {
  return workspace.mode === "live"
    ? `live:${workspace.studioId}:${workspace.role}:${workspace.guardianId ?? ""}`
    : "mock";
}

export function setStudioWorkspace(next: StudioWorkspace) {
  current = next;
}

/** True when this exact workspace has already been loaded into the store in this tab. */
export function isWorkspaceLoaded(workspace: StudioWorkspace): boolean {
  return loadedKey === workspaceKey(workspace);
}

export function markWorkspaceLoaded(workspace: StudioWorkspace | null) {
  loadedKey = workspace ? workspaceKey(workspace) : null;
}

export function resetStudioWorkspaceForTests() {
  current = { mode: "mock" };
  loadedKey = null;
}

export function liveUserId(): string | null {
  return current.mode === "live" ? current.userId : null;
}
