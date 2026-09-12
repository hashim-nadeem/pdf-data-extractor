import { ExtractError } from "@/lib/errors";
import { extractDocument, type Step } from "@/lib/extract";
import { extractPdfText, guardFile, MAX_MB, type PdfText } from "@/lib/pdf";
import { checkRateLimit } from "@/lib/ratelimit";
import { isDocType, type DocType } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const line = (o: unknown) => new TextEncoder().encode(JSON.stringify(o) + "\n");

/** An unexpected throw is our bug, not the model's — don't blame the provider. */
const asExtractError = (e: unknown) =>
  e instanceof ExtractError ? e : new ExtractError("internal", String(e).slice(0, 200));

const fail = (e: unknown) => {
  const err = asExtractError(e);
  return Response.json(err.toJSON(), { status: err.status });
};

/**
 * Multipart in, newline-delimited JSON out: one line per completed step, then
 * the result. Nothing touches disk and nothing is logged.
 */
export async function POST(req: Request) {
  let pdf: PdfText;
  let type: DocType;
  try {
    await checkRateLimit(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon");

    // Reject on the declared size before formData() buffers the whole body.
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > (MAX_MB + 1) * 1024 * 1024)
      throw new ExtractError("too_large", `${(declared / 1e6).toFixed(1)} MB, limit ${MAX_MB} MB.`);

    const form = await req.formData();
    const t = form.get("type");
    if (!isDocType(t)) throw new ExtractError("bad_type");
    type = t;

    const entry = form.get("file");
    const file = entry instanceof File ? entry : null;
    guardFile(file);
    pdf = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return fail(e);
  }

  const stream = new ReadableStream({
    async start(controller) {
      // The client may be gone: enqueueing into a cancelled stream throws.
      const send = (o: unknown) => {
        try {
          controller.enqueue(line(o));
        } catch {
          /* client disconnected */
        }
      };
      send({ step: "reading" satisfies Step });
      try {
        const result = await extractDocument(type, pdf, (step) => send({ step }), req.signal);
        send({ result });
      } catch (e) {
        send(asExtractError(e).toJSON());
      }
      try {
        controller.close();
      } catch {
        /* already closed by the client */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
