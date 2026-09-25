import { withGeminiRotation } from "@/lib/gemini";
import { VOICE_SKILL } from "@/lib/voiceSkill.generated";
import { fetchTopNews, verifyFlag, type NewsItem } from "@/lib/news";
import { lintPost, lintIssues } from "@/lib/structure";

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

export type Plan = {
  format: "personal_story" | "case_study" | "topical";
  coreEmotion: string;
  wowFactor: string;
  coreElements: string[];
  hooks: { text: string; technique: string }[];
  bestHook: number;
};

// Structure comes from Session 2 (Storytelling & Writing, Ananya Narang). Voice comes from voice-skill.txt.
// Where they disagree on rhythm (long vs short sentences), the structure rules win.
const STRUCTURE_RULES = `You are a LinkedIn ghostwriter. Write posts that give the reader a dopamine hit in every sentence.
Rules that cannot be broken:
- Hook is anecdotal or data-led: something that happened, or a number. Never philosophy. Never a question. Never reveal the ending; tease the tension. Numbers beat words (0.4 beats "a small amount").
- No sentence longer than 10 words. No paragraph longer than 3 lines. One thought per sentence. Subject before action, active voice ("The supplier changed the blend", never "The blend was changed").
- Punchy phrases are fine where they land harder than full sentences.
- One core emotion. Strong opinion only: pick a side, do not explain both sides. Grey is forgettable.
- Max two core ideas. ABCD progression: every line moves the reader forward and never restates. Say the thing once. The line after the hook must add NEW information, never rephrase the hook.
- Stay inside the note. Never strengthen a cautious statement into a bigger claim, and never add a fact, cause or consequence she did not state.
- No adverbs. No flowery language. No "excited to share" or "humbled". No fancy vocabulary. No emojis, no hashtags.
- Length: half a page to one page (about 130 to 230 words). Shorter and finished beats longer.
- Ending: about 80% is her specific story. The final one or two lines turn it into a broader point of view that anyone in a wider group (not only skincare founders) could comment on. Never "What do you think?". Never a pitch.`;

export async function planPost(note: string): Promise<Plan> {
  return geminiJson<Plan>(
    `${STRUCTURE_RULES}

Before writing, plan the post from this note by a skincare founder (Meera Pillai).
1. format: personal_story (her own moment, 80% story), case_study (surprising result first, then her thinking, then a transferable lesson), or topical (only if the news item is the point and timely).
2. wowFactor: the single most surprising fact, number or twist actually in the note. Do not invent one.
3. coreEmotion: pick ONE of controversial, humor, mystery, inspiration, sarcasm, nostalgia.
4. coreElements: at most two.
5. hooks: three structurally different hooks, each an anecdote or a data-led opener under 200 characters that does not reveal the ending. Vary the technique (surprising number, contrast, in-the-moment scene).
6. bestHook: index 0-2 of the strongest.

NOTE:
"""
${note}
"""
`,
    {
      type: "object",
      properties: {
        format: { type: "string", enum: ["personal_story", "case_study", "topical"] },
        coreEmotion: { type: "string" },
        wowFactor: { type: "string" },
        coreElements: { type: "array", items: { type: "string" } },
        hooks: {
          type: "array",
          items: { type: "object", properties: { text: { type: "string" }, technique: { type: "string" } }, required: ["text", "technique"] },
        },
        bestHook: { type: "integer" },
      },
      required: ["format", "coreEmotion", "wowFactor", "coreElements", "hooks", "bestHook"],
    }
  );
}

function draftPrompt(note: string, news: NewsItem | null, plan: Plan): string {
  const hook = plan.hooks[Math.max(0, Math.min(plan.hooks.length - 1, plan.bestHook))]?.text ?? "";
  const newsBlock = news
    ? `NEWS ITEM (may or may not fit):
Headline: ${news.headline}
Source: ${news.source}, ${news.date}
Summary: ${news.summary}

If this news item is genuinely relevant, use it to make the post timely. If it doesn't fit naturally, ignore it.`
    : "No news item is available. Write the post from the note alone.";
  return `${STRUCTURE_RULES}

VOICE PROFILE (governs word choice, evidence, what she never says, how personal she gets. If it disagrees with the
structure rules on sentence length or paragraph length, the structure rules win):
${VOICE_SKILL}

PLAN:
Format: ${plan.format}
Core emotion: ${plan.coreEmotion}
Wow factor: ${plan.wowFactor}
Core ideas: ${plan.coreElements.join("; ")}
Open with this hook (polish only if needed, keep the suspense): ${hook}

NOTE FROM MEERA:
"""
${note}
"""

${newsBlock}

Use only facts present in the note (and the news item if you use it). Do not invent numbers, studies or quotes. Plain text only.
Respond with the post text first. Then, on a final separate line, write exactly USED_NEWS: yes or USED_NEWS: no.`;
}

export type Draft = {
  body: string;
  usedNews: boolean;
  model: string;
  plan: Plan;
  otherHooks: string[];
  lintLeft: string[];
};

/** Splits off the USED_NEWS marker. Does NOT add the verify flag; see composeDraft. */
export function splitDraft(raw: string, news: NewsItem | null): { body: string; usedNews: boolean } {
  const m = raw.match(/\n?\s*USED_NEWS:\s*(yes|no)\s*$/i);
  const usedNews = !!news && !!m && m[1].toLowerCase() === "yes";
  return { body: (m ? raw.slice(0, m.index) : raw).trim(), usedNews };
}

export function composeDraft(body: string, usedNews: boolean, news: NewsItem | null): string {
  return usedNews && news ? `${body}\n\n${verifyFlag(news)}` : body;
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

async function generate(prompt: string, provider: "gemini" | "claude"): Promise<{ text: string; model: string }> {
  if (provider === "claude" && process.env.ANTHROPIC_API_KEY) {
    return { text: await draftWithClaude(prompt), model: process.env.CLAUDE_MODEL || "claude-sonnet-5" };
  }
  const model = process.env.GEMINI_DRAFT_MODEL || fastModel();
  const res = await withGeminiRotation((ai) =>
    ai.models.generateContent({ model, contents: prompt, config: { temperature: 0.7 } })
  );
  if (!res.text) throw new Error("Gemini returned an empty draft.");
  return { text: res.text, model };
}

/** Flags sentences that go beyond what Meera said, and lines that restate an earlier line. */
export async function checkGrounding(note: string, body: string, news: NewsItem | null): Promise<string[]> {
  const out = await geminiJson<{ unsupported: string[]; repeated: string[] }>(
    `You are a strict fact checker. Compare a LinkedIn draft to the founder's original note${news ? " and the news item" : ""}.
List every draft sentence that:
(a) states a fact, cause, consequence, number, or claim that is NOT in the note${news ? " or news item" : ""}, or makes a cautious statement stronger
    (example: note says "the batch isn't unsafe", draft says "it passed all safety tests" or "the batch was ruined"), or
(b) repeats or rephrases an earlier line in the draft.
General closing thoughts that only widen her stated point are fine. Quote sentences exactly. Empty arrays if none.

NOTE:
"""
${note}
"""
${news ? `NEWS ITEM: ${news.headline}. ${news.summary}\n` : ""}
DRAFT:
"""
${body}
"""`,
    {
      type: "object",
      properties: { unsupported: { type: "array", items: { type: "string" } }, repeated: { type: "array", items: { type: "string" } } },
      required: ["unsupported", "repeated"],
    }
  );
  const issues: string[] = [];
  if (out.unsupported.length) issues.push(`Not supported by her note (remove, or restate only what she actually said): ${out.unsupported.map((x) => `"${x}"`).join(" | ")}`);
  if (out.repeated.length) issues.push(`Repeats an earlier line (cut it or add new information): ${out.repeated.map((x) => `"${x}"`).join(" | ")}`);
  return issues;
}

export const TIME_BUDGET_MS = 110_000; // route maxDuration is 180s; leave room for Telegram sends and DB writes.

export async function writeDraft(
  note: string,
  news: NewsItem | null,
  plan: Plan,
  startedAt: number = Date.now(),
  provider: "gemini" | "claude" = (process.env.DRAFT_PROVIDER as "gemini" | "claude") || "gemini"
): Promise<Draft> {
  const first = await generate(draftPrompt(note, news, plan), provider);
  let { body, usedNews } = splitDraft(first.text, news);

  // Session 2 prompt 4: don't rewrite the whole thing, fix the specific problems. One pass, only if time allows.
  const issues = [...lintIssues(lintPost(body)), ...(await checkGrounding(note, body, news).catch(() => []))];
  let lintLeft = issues;
  if (issues.length > 0 && Date.now() - startedAt < TIME_BUDGET_MS) {
    const fix = await generate(
      `${STRUCTURE_RULES}

This LinkedIn draft breaks specific rules. Do not rewrite the whole thing and do not change facts, numbers or her voice.
Fix only these problems, keep everything else, and return the full corrected post as plain text with no commentary:
${issues.map((i) => `- ${i}`).join("\n")}

DRAFT:
"""
${body}
"""`,
      provider
    );
    body = fix.text.replace(/\n?\s*USED_NEWS:\s*(yes|no)\s*$/i, "").trim();
    lintLeft = lintIssues(lintPost(body));
  }

  const best = Math.max(0, Math.min(plan.hooks.length - 1, plan.bestHook));
  return {
    body: composeDraft(body, usedNews, news),
    usedNews,
    model: first.model,
    plan,
    otherHooks: plan.hooks.filter((_, i) => i !== best).map((h) => h.text),
    lintLeft,
  };
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
