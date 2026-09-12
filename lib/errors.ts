/** Every error the API can return, with the message the UI shows verbatim. */
export const ERRORS = {
  not_pdf: { status: 415, message: "That file isn't a PDF. Only PDF files are supported." },
  too_large: { status: 413, message: "That file is larger than the limit." },
  too_many_pages: { status: 413, message: "That PDF has too many pages." },
  no_text_layer: { status: 422, message: "This PDF has no text layer — OCR isn't supported yet." },
  unreadable: { status: 422, message: "That PDF could not be read. It may be corrupt or password protected." },
  no_file: { status: 400, message: "No file was uploaded." },
  bad_type: { status: 400, message: "Unknown document type." },
  rate_limited: { status: 429, message: "Too many requests. Try again in a minute." },
  no_provider: { status: 503, message: "No LLM provider is configured on this deployment." },
  quota: { status: 503, message: "The free-tier model quota is exhausted. Try again later." },
  busy: { status: 503, message: "The model is busy right now. Try again in a moment." },
  invalid_output: { status: 502, message: "The model failed validation twice. Nothing was extracted." },
  internal: { status: 500, message: "Something went wrong on the server." },
  provider_failed: { status: 502, message: "The model could not be reached." },
} as const;

export type ErrorCode = keyof typeof ERRORS;

export class ExtractError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
  ) {
    super(ERRORS[code].message);
  }
  get status() {
    return ERRORS[this.code].status;
  }
  toJSON() {
    return { error: this.code, message: this.message, detail: this.detail };
  }
}
