import { ExtractError } from "./errors";

/**
 * The ONLY file that talks to a model provider. Swap the provider here and
 * nothing else in the app changes — both paths take a JSON Schema and a prompt
 * and return parsed JSON, or throw.
 */
export type Provider = "google" | "ollama";

export const provider = (): Provider =>
  process.env.LLM_PROVIDER === "ollama" ? "ollama" : "google";

export const llmConfigured = () =>
  provider() === "ollama" || !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

export const modelName = () =>
  provider() === "ollama"
    ? (process.env.OLLAMA_MODEL ?? "llama3.2")
    : (process.env.GOOGLE_MODEL ?? "gemini-3.5-flash-lite");

/**
 * Budget, not a guess: the route's `maxDuration` is 60s, and a retry means two
 * attempts plus one backoff. 25 + 3 + 25 = 53s, which fits. Raise `maxDuration`
 * before raising these.
 */
const TIMEOUT_MS = 25_000;
const BACKOFF_MS = [0, 3_000];

/** Transient on the free tier — worth one retry. 429 is not: that is a real cap. */
const RETRYABLE = new Set([500, 503]);

export async function generateStructured(
  jsonSchema: object,
  prompt: string,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!llmConfigured()) throw new ExtractError("no_provider");
  const text =
    provider() === "ollama"
      ? await callOllama(jsonSchema, prompt, signal)
      : await callGoogle(prompt, signal);
  return parseJson(text);
}

/** Caller's abort (client disconnect) or our own timeout, whichever comes first. */
const deadline = (signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);

async function callGoogle(prompt: string, signal?: AbortSignal): Promise<string> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName()}:generateContent`;

  let res!: Response;
  for (const wait of BACKOFF_MS) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
      signal: deadline(signal),
    }).catch((e: Error) => {
      throw new ExtractError("provider_failed", `${e.name}: ${e.message}`);
    });
    if (!RETRYABLE.has(res.status)) break;
  }

  if (res.status === 429) throw new ExtractError("quota");
  if (RETRYABLE.has(res.status)) throw new ExtractError("busy", modelName());
  if (!res.ok) throw new ExtractError("provider_failed", `${res.status} ${await res.text()}`.slice(0, 300));

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new ExtractError("provider_failed", "Empty response from the model.");
  return text;
}

async function callOllama(
  jsonSchema: object,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: modelName(),
      prompt,
      // Ollama accepts a JSON Schema here; older builds fall back to plain JSON mode.
      format: jsonSchema,
      stream: false,
      options: { temperature: 0 },
    }),
    signal: deadline(signal),
  }).catch((e: Error) => {
    throw new ExtractError("provider_failed", `Could not reach Ollama at ${base}. ${e.message}`);
  });

  if (!res.ok) throw new ExtractError("provider_failed", `${res.status} ${await res.text()}`.slice(0, 300));
  const body = (await res.json()) as { response?: string };
  if (!body.response) throw new ExtractError("provider_failed", "Empty response from Ollama.");
  return body.response;
}

/** Models sometimes wrap JSON in a fence despite JSON mode. */
function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    try {
      if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      // fall through to the message the retry prompt is written around
    }
    throw new Error("The model did not return valid JSON.");
  }
}
