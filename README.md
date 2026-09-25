# Meera Bot

Telegram bot for the Skinstinct case. Meera sends a raw note; the bot screens it (Gemini, 0-10),
skips weak notes with a reason, adds a Google News angle, drafts a LinkedIn post in her voice, and
stores everything in Supabase. Nothing is ever published: Meera replies APPROVE or REJECT.

Flow: Telegram webhook -> `/api/webhook` -> score -> (>=6) keywords -> Google News RSS -> draft -> reply.
Rejected notes and drafts are kept.

## Setup
1. Copy `.env.example` to `.env.local`, fill it in (Gemini keys rotate on rate limit, see `src/lib/gemini.ts`).
2. `npm install && npm run db:setup` (creates `notes`, `drafts`, `voice_skill`).
3. `npm test`, `npx tsx scripts/try-notes.ts` (pipeline without Telegram).
4. Deploy to Vercel with the same env vars, then `npm run webhook -- https://<project>.vercel.app`.

The voice profile lives in `voice-skill.txt` and is compiled into `src/lib/voiceSkill.generated.ts`.
Set `DRAFT_PROVIDER=claude` and `ANTHROPIC_API_KEY` to draft with Claude instead of Gemini.
