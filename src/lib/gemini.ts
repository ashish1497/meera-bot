import { GoogleGenAI } from "@google/genai";

// Same rotation strategy as ares-brain's scraper/transcribe.py: on a
// rate-limit or server error, advance to the next key and retry, rather
// than failing the whole request the moment one key is throttled.

const RETRY_MARKERS = [
  "429",
  "resource_exhausted",
  "quota",
  "rate",
  "503",
  "500",
  "502",
  "504",
  "overloaded",
  "unavailable",
  "timeout",
  "timed out",
  "deadline",
  "connection",
  "temporarily",
];

function isRetryable(err: unknown): boolean {
  const blob = `${err instanceof Error ? err.name : ""} ${err instanceof Error ? err.message : String(err)}`.toLowerCase();
  return RETRY_MARKERS.some((marker) => blob.includes(marker));
}

function geminiKeys(): string[] {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ];
  return keys.filter((k): k is string => Boolean(k));
}

/**
 * Runs `fn` against a Gemini client, rotating to the next available API key
 * on a retryable error (rate limit, quota, 5xx) and retrying the SAME call,
 * up to once per configured key. Throws the last error once every key has
 * been tried, or immediately for a non-retryable error.
 */
export async function withGeminiRotation<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  const keys = geminiKeys();
  if (keys.length === 0) {
    throw new Error(
      "No GEMINI_API_KEY (or GEMINI_API_KEY_2 / GEMINI_API_KEY_3) configured. Add at least one to the environment."
    );
  }

  let lastError: unknown;
  for (let i = 0; i < keys.length; i++) {
    try {
      const client = new GoogleGenAI({ apiKey: keys[i] });
      return await fn(client);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || i === keys.length - 1) throw err;
      console.warn(
        `[meera-bot] Gemini call failed (${err instanceof Error ? err.message : err}), rotating to key #${i + 2} of ${keys.length}`
      );
    }
  }
  throw lastError;
}
