// Deterministic checks for the Session 2 "Storytelling & Writing" rules (Personal Branding, Ananya Narang).

export type Lint = {
  longSentences: string[]; // over 12 words (rule is ~10, small tolerance)
  longParagraphs: string[]; // over 3 rows on mobile (~220 chars)
  adverbs: string[];
  banned: string[];
  hookProblems: string[];
  endingProblems: string[];
  wordCount: number;
};

export const MAX_SENTENCE_WORDS = 12;
export const MAX_PARAGRAPH_CHARS = 220;
export const MAX_HOOK_CHARS = 210;
export const MAX_WORDS = 260;

const LY_OK = new Set([
  "only", "early", "family", "supply", "apply", "reply", "likely", "daily", "july", "assembly", "anomaly",
  "rely", "friendly", "ally", "italy", "monopoly", "multiply", "lonely", "weekly", "monthly", "yearly",
  "silly", "bully", "belly", "holy", "ugly", "fly", "imply", "comply", "butterfly", "chemistry",
]);
const BANNED = [
  "excited to share", "humbled", "thrilled", "game-changer", "game changer", "what do you think",
  "thoughts?", "agree?", "dm me", "link in", "follow me", "in today's", "let that sink in",
];

export function paragraphs(body: string): string[] {
  return body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export function sentences(body: string): string[] {
  return body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

export function lintPost(body: string): Lint {
  const paras = paragraphs(body);
  const hook = paras[0] ?? "";
  const last = paras[paras.length - 1] ?? "";
  const lower = body.toLowerCase();

  const adverbs = Array.from(
    new Set((lower.match(/\b[a-z]{3,}ly\b/g) ?? []).filter((w) => !LY_OK.has(w)).concat(lower.match(/\bvery\b/g) ?? []))
  );

  const hookProblems: string[] = [];
  if (hook.length > MAX_HOOK_CHARS) hookProblems.push(`hook is ${hook.length} chars; keep the opening under ${MAX_HOOK_CHARS} so it fits before "see more"`);
  if (/\?/.test(hook)) hookProblems.push("hook is a question; open with an event or a number instead");

  const endingProblems: string[] = [];
  if (/\?\s*$/.test(last)) endingProblems.push("ending is a question; end on a stated point of view");
  if (paras.length < 3) endingProblems.push("post is too short to have a story plus a closing thought");

  return {
    longSentences: sentences(body).filter((s) => words(s).length > MAX_SENTENCE_WORDS),
    longParagraphs: paras.filter((p) => p.length > MAX_PARAGRAPH_CHARS),
    adverbs,
    banned: BANNED.filter((b) => lower.includes(b)),
    hookProblems,
    endingProblems,
    wordCount: words(body).length,
  };
}

export function lintIssues(l: Lint): string[] {
  const out: string[] = [];
  if (l.longSentences.length) out.push(`Sentences over ${MAX_SENTENCE_WORDS - 2} words (split or cut): ${l.longSentences.map((s) => `"${s}"`).join(" | ")}`);
  if (l.longParagraphs.length) out.push(`Paragraphs longer than 3 mobile rows (break them up): ${l.longParagraphs.map((p) => `"${p.slice(0, 60)}..."`).join(" | ")}`);
  if (l.adverbs.length) out.push(`Adverbs to remove: ${l.adverbs.join(", ")}`);
  if (l.banned.length) out.push(`Banned phrases: ${l.banned.join(", ")}`);
  out.push(...l.hookProblems, ...l.endingProblems);
  if (l.wordCount > MAX_WORDS) out.push(`Post is ${l.wordCount} words; cut to under ${MAX_WORDS} (one page max)`);
  return out;
}
