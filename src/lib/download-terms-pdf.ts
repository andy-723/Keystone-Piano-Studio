import { downloadTermsPdf } from "@/lib/terms-pdf";

/** Prefer the API route; fall back to client-side pdf-lib if the request fails. */
export async function downloadDocumentPdf(input: {
  title: string;
  body: string;
  filename: string;
  footer?: string;
}) {
  try {
    const response = await fetch("/api/terms/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`PDF API ${response.status}`);
    const blob = await response.blob();
    if (blob.type && !blob.type.includes("pdf") && blob.size < 100) throw new Error("Not a PDF");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = input.filename.endsWith(".pdf") ? input.filename : `${input.filename}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    await downloadTermsPdf(input);
  }
}
