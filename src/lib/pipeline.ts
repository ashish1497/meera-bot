import { withGeminiRotation } from "@/lib/gemini";
import { VOICE_SKILL } from "@/lib/voiceSkill.generated";
import { fetchTopNews, verifyFlag, type NewsItem } from "@/lib/news";

export const SCORE_THRESHOLD = 6;
const fastModel = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";

async function geminiJson<T>(prompt: string, schema: object): Promise<T> {
  const res = await withGeminiRotation((ai) =>
    ai.models.generateContent({
      model: fastModel(),
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
    })
  );
  if (!res.text) throw new Error("Gemini returned an empty response.");
  return JSON.parse(res.text) as T;
}

export async function scoreNote(note: string): Promise<{ score: number; reason: string }> {
  const out = await geminiJson<{ score: number; reason: string }>(
    `You screen raw notes from a skincare founder (Meera Pillai, ex-pharma formulation scientist) to decide
which are worth developing into a LinkedIn post. Score the note 0-10 for publishability.

Score HIGH (7-10) only if the note has: a specific observation, event or datapoint; a clear point or lesson
she could argue in a post; and enough substance to write 250+ words without inventing facts.
Score MID (4-6) if there is a real idea but it is thin, unresolved, or she says herself she has no new angle.
Score LOW (0-3) for logistics, reminders, to-dos, greetings, half-sentences, questions to herself, or anything
with no publishable point.
Be strict. Do not reward length or tidy wording; reward a specific point.

Return JSON: {"score": integer 0-10, "reason": one plain sentence, max 25 words}.

NOTE:
"""
${note}
"""`,
    {
      type: "object",
      properties: { score: { type: "integer" }, reason: { type: "string" } },
      required: ["score", "reason"],
    }
  );
  return { score: Math.max(0, Math.min(10, Math.round(out.score))), reason: out.reason.trim() };
}

export async function searchPhrase(note: string): Promise<string> {
  const out = await geminiJson<{ keywords: string[]; phrase: string }>(
    `From this skincare founder's note, pull 3-5 search terms and combine them into one short Google News
search phrase (max 8 words) for finding a current industry news item or data point related to the note's topic.
Return JSON: {"keywords": [3-5 strings], "phrase": string}.

NOTE:
"""
${note}
"""`,
    {
      type: "object",
      properties: { keywords: { type: "array", items: { type: "string" } }, phrase: { type: "string" } },
      required: ["keywords", "phrase"],
    }
  );
  return out.phrase.trim();
}

function draftPrompt(note: string, news: NewsItem | null): string {
  const newsBlock = news
    ? `NEWS ITEM (may or may not fit):
Headline: ${news.headline}
Source: ${news.source}, ${news.date}
Summary: ${news.summary}

If this news item is genuinely relevant, use it to make the post timely. If it doesn't fit naturally, ignore it.`
    : "No news item is available. Write the post from the note alone.";
  return `Write a LinkedIn post for Meera Pillai from the note below. Follow the voice profile exactly.

VOICE PROFILE:
${VOICE_SKILL}

NOTE FROM MEERA:
"""
${note}
"""

${newsBlock}

Rules: use only facts present in the note (and the news item if you use it). Do not invent numbers, studies or
quotes. No hashtags, emojis or greeting. Plain text only.
Respond with the post text first. Then, on a final separate line, write exactly USED_NEWS: yes or USED_NEWS: no.`;
}

export type Draft = { body: string; usedNews: boolean; model: string };

export function splitDraft(raw: string, news: NewsItem | null): { body: string; usedNews: boolean } {
  const m = raw.match(/\n?\s*USED_NEWS:\s*(yes|no)\s*$/i);
  const usedNews = !!news && !!m && m[1].toLowerCase() === "yes";
  const body = (m ? raw.slice(0, m.index) : raw).trim();
  return { body: usedNews && news ? `${body}\n\n${verifyFlag(news)}` : body, usedNews };
}

async function draftWithClaude(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: process.env.CLAUDE_MODEL || "claude-sonnet-5", max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
  });
  const json = (await res.json()) as { content?: { text?: string }[]; error?: { message: string } };
  if (!res.ok || !json.content?.[0]?.text) throw new Error(`Claude draft failed: ${json.error?.message ?? res.status}`);
  return json.content[0].text;
}

export async function writeDraft(
  note: string,
  news: NewsItem | null,
  provider: "gemini" | "claude" = (process.env.DRAFT_PROVIDER as "gemini" | "claude") || "gemini"
): Promise<Draft> {
  const prompt = draftPrompt(note, news);
  let raw: string;
  let model: string;
  if (provider === "claude" && process.env.ANTHROPIC_API_KEY) {
    raw = await draftWithClaude(prompt);
    model = process.env.CLAUDE_MODEL || "claude-sonnet-5";
  } else {
    const res = await withGeminiRotation((ai) =>
      ai.models.generateContent({
        model: process.env.GEMINI_DRAFT_MODEL || fastModel(),
        contents: prompt,
        config: { temperature: 0.7 },
      })
    );
    if (!res.text) throw new Error("Gemini returned an empty draft.");
    raw = res.text;
    model = process.env.GEMINI_DRAFT_MODEL || fastModel();
  }
  return { ...splitDraft(raw, news), model };
}

export async function findNews(note: string): Promise<{ phrase: string; news: NewsItem | null }> {
  try {
    const phrase = await searchPhrase(note);
    return { phrase, news: await fetchTopNews(phrase) };
  } catch (err) {
    console.warn("[meera-bot] news lookup failed, drafting without it:", err);
    return { phrase: "", news: null };
  }
}
