import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const TITLE_SIZE = 16;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14;
const FOOTER_SIZE = 8;

function wrapLines(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/** Build a simple multi-page PDF from a title and plain/markdown-ish body. */
export async function buildTermsPdf(input: {
  title: string;
  body: string;
  footer?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxChars = 92;
  const contentLines = wrapLines(input.body.replace(/\*\*/g, "").replace(/^#+\s*/gm, ""), maxChars);
  const titleLines = wrapLines(input.title, 60);
  const footer = input.footer ?? "Keystone Music HQ · Australian studio template";

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 24) {
      page.drawText(footer, {
        x: MARGIN,
        y: MARGIN - 8,
        size: FOOTER_SIZE,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  for (const line of titleLines) {
    ensureSpace(LINE_HEIGHT + 4);
    page.drawText(line, { x: MARGIN, y, size: TITLE_SIZE, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= TITLE_SIZE + 6;
  }
  y -= 8;

  for (const line of contentLines) {
    ensureSpace(LINE_HEIGHT);
    if (line) {
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font, color: rgb(0.15, 0.15, 0.15) });
    }
    y -= LINE_HEIGHT;
  }

  page.drawText(footer, {
    x: MARGIN,
    y: MARGIN - 8,
    size: FOOTER_SIZE,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  return doc.save();
}

export function triggerPdfDownload(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadTermsPdf(input: {
  title: string;
  body: string;
  filename: string;
  footer?: string;
}) {
  const bytes = await buildTermsPdf(input);
  triggerPdfDownload(bytes, input.filename);
}
