import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sha256Hex } from "@/lib/onboarding/crypto";
import { formatAUD, formatNumericDate } from "@/lib/format";
import type { Invoice } from "@/mocks/types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

export type RenderedInvoicePdf = {
  bytes: Uint8Array;
  sha256: string;
  path: string;
};

/** Render a simple A4 invoice PDF and return bytes + sha256. */
export async function renderInvoicePdf(invoice: Invoice, opts?: { filename?: string }): Promise<RenderedInvoicePdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const draw = (text: string, size = 11, useBold = false) => {
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.12, 0.12, 0.12),
    });
    y -= size + 6;
  };

  const title = invoice.title ?? (invoice.isTaxInvoice ? "Tax invoice" : "Invoice");
  draw(title, 18, true);
  draw(invoice.number ?? "Draft", 12, true);
  draw(`Issued ${formatNumericDate(invoice.issueDate)} · Due ${formatNumericDate(invoice.dueDate)}`);
  y -= 8;

  if (invoice.snapshot?.seller) {
    draw(invoice.snapshot.seller.legalName || invoice.snapshot.seller.tradingName, 12, true);
    if (invoice.snapshot.seller.abn) draw(`ABN ${invoice.snapshot.seller.abn}`);
  }
  if (invoice.snapshot?.buyer) {
    y -= 4;
    draw("Bill to", 10, true);
    draw(invoice.snapshot.buyer.name);
    draw(invoice.snapshot.buyer.email, 10);
  }

  y -= 10;
  draw("Description                                          Qty    Amount", 10, true);
  for (const line of invoice.lines) {
    const desc = line.description.length > 48 ? `${line.description.slice(0, 45)}...` : line.description;
    draw(`${desc}  ${line.qty}  ${formatAUD(line.lineTotalCents)}`, 10);
  }

  y -= 8;
  if (invoice.isTaxInvoice) {
    draw(`Subtotal ${formatAUD(invoice.subtotalCents)}`);
    draw(`GST included ${formatAUD(invoice.taxCents)}`);
  }
  draw(`Total ${formatAUD(invoice.totalCents)}`, 13, true);
  draw(`Balance ${formatAUD(invoice.balanceCents ?? invoice.totalCents)}`, 11, true);

  if (invoice.snapshot?.payTo?.bsb || invoice.snapshot?.payTo?.payId) {
    y -= 10;
    draw("Payment details", 11, true);
    if (invoice.snapshot.payTo.accountName) draw(invoice.snapshot.payTo.accountName);
    if (invoice.snapshot.payTo.bsb) {
      const bsb = invoice.snapshot.payTo.bsb;
      const formatted = bsb.length === 6 ? `${bsb.slice(0, 3)}-${bsb.slice(3)}` : bsb;
      draw(`BSB ${formatted}`);
    }
    if (invoice.snapshot.payTo.accountNumber) {
      const digits = invoice.snapshot.payTo.accountNumber.replace(/\D/g, "");
      draw(`Account ••••${digits.slice(-4)}`);
    }
    if (invoice.snapshot.payTo.payId) draw(`PayID ${invoice.snapshot.payTo.payId}`);
  }

  const bytes = await doc.save();
  const copy = Uint8Array.from(bytes);
  const sha256 = await sha256Hex(copy.buffer);
  const path = opts?.filename ?? `invoices/${invoice.number ?? invoice.id}.pdf`;
  return { bytes, sha256, path };
}
