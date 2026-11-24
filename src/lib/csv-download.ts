import { ensureRecentMfa } from "./step-up";

/**
 * Save a CSV in the browser. Exports are sensitive (Andrew, 24 Nov 2026): on a real sign-in the
 * authenticator code is asked for again if it wasn't entered in the last 10 minutes. Cancelling
 * the code prompt cancels the download.
 */
export async function downloadCsv(filename: string, csv: string): Promise<boolean> {
  try {
    await ensureRecentMfa();
  } catch {
    return false;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}
