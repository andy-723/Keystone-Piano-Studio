import { createFileRoute } from "@tanstack/react-router";
import { buildTermsPdf } from "@/lib/terms-pdf";
import { readJsonWithLimit } from "@/server/body-limit";

type PdfBody = {
  title?: string;
  body?: string;
  filename?: string;
  footer?: string;
};

/** Terms PDF bodies can be large; still capped (512 KiB JSON envelope). */
const TERMS_PDF_BODY_LIMIT = 512 * 1024;

export const Route = createFileRoute("/api/terms/pdf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: PdfBody;
        try {
          payload = await readJsonWithLimit<PdfBody>(request, TERMS_PDF_BODY_LIMIT);
        } catch {
          return Response.json({ error: "Request body too large" }, { status: 413 });
        }
        const title = String(payload.title ?? "Document").slice(0, 200);
        const body = String(payload.body ?? "").slice(0, 200_000);
        if (!body.trim()) {
          return Response.json({ error: "Missing body" }, { status: 400 });
        }
        const bytes = await buildTermsPdf({
          title,
          body,
          footer: payload.footer ?? "Keystone Music HQ · Australian studio template",
        });
        const filename = String(payload.filename ?? "document.pdf").replace(/[^\w.-]+/g, "-");
        return new Response(Buffer.from(bytes), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename.endsWith(".pdf") ? filename : `${filename}.pdf`}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
