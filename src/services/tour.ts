/**
 * Guided tour progress (studio tour for staff, family tour for guardians).
 *
 * Prototype: kept in this browser's localStorage so a tour opens once, resumes after a reload
 * and can be replayed. Real build: a `tour_state` jsonb column on the person's own profile row
 * (never on the studio), read and written through the same two functions.
 */
export type TourId = "studio" | "family" | "setup";
export type TourStatus = "not_started" | "in_progress" | "dismissed" | "completed";
export type TourProgress = { stepIndex: number; status: TourStatus };

const STATUSES: TourStatus[] = ["not_started", "in_progress", "dismissed", "completed"];
const DEFAULT: TourProgress = { stepIndex: 0, status: "not_started" };

export const tourStorageKey = (id: TourId) => `keystone.tour.v1.${id}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(id: TourId): TourProgress {
  const raw = storage()?.getItem(tourStorageKey(id));
  if (!raw) return { ...DEFAULT };
  try {
    const value = JSON.parse(raw) as Partial<TourProgress>;
    const status = STATUSES.includes(value.status as TourStatus)
      ? (value.status as TourStatus)
      : "not_started";
    const stepIndex =
      Number.isInteger(value.stepIndex) && (value.stepIndex as number) >= 0
        ? (value.stepIndex as number)
        : 0;
    return { stepIndex, status };
  } catch {
    return { ...DEFAULT };
  }
}

export async function getTourProgress(id: TourId): Promise<TourProgress> {
  return read(id);
}

export async function saveTourProgress(id: TourId, progress: TourProgress): Promise<TourProgress> {
  if (!STATUSES.includes(progress.status)) throw new Error("Unknown tour status.");
  if (!Number.isInteger(progress.stepIndex) || progress.stepIndex < 0)
    throw new Error("Tour step must be a whole number from 0.");
  const value = { stepIndex: progress.stepIndex, status: progress.status };
  storage()?.setItem(tourStorageKey(id), JSON.stringify(value));
  return value;
}
