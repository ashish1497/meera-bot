// Runs the pipeline (no Telegram, no DB) on sample notes. usage: npx tsx scripts/try-notes.ts [index]
process.loadEnvFile(".env.local");
const { scoreNote, findNews, planPost, writeDraft, SCORE_THRESHOLD } = await import("../src/lib/pipeline.ts");
const notes = [
  "Okay so batch fourteen came back from the manufacturer and the pH stability data looked off. I went back to the supplier and it turns out they quietly changed the preservative blend without notifying us. They sent a revised spec sheet three months ago but it got buried. The new preservative system is more acidic than the previous one. The finished product pH dropped by about 0.4 units which sounds small but it's enough to push us out of the optimal range for our emollient blend. The batch isn't unsafe but the texture is different in a way that I think customers will notice. We're holding it. I need to write about this because the assumption that a 'same formula' reorder is actually the same formula. It often isn't. If you're not checking the CoA against a baseline every batch, you won't catch it until the customer does.",
  "Clean beauty as a term. It means nothing regulatory and everything marketing. The problem is that the audience that finds 'clean beauty' meaningful is also an audience that's engaged and willing to pay for products they trust. I just think the mechanism they've landed on, ingredient blacklists, is a blunt instrument. A product can pass every clean beauty checklist and still have ineffective actives at sub-therapeutic concentrations. I think I want to write about this but I've said some version of this before and I'm not sure what the new angle is.",
  "remind me to call the packaging vendor tomorrow about the carton delivery",
  "hmm maybe something about",
];
const only = process.argv[2];
for (const [i, note] of notes.entries()) {
  if (only && Number(only) !== i) continue;
  const t0 = Date.now();
  const [s, plan, found] = await Promise.all([scoreNote(note), planPost(note), findNews(note)]);
  console.log(`\n#${i} score ${s.score}/10 :: ${s.reason}`);
  if (s.score < SCORE_THRESHOLD) { console.log("-> NO DRAFT"); continue; }
  const { phrase, news } = found;
  console.log("news phrase:", phrase, "| item:", news?.headline, "|", news?.source, news?.date);
  const d = await writeDraft(note, news, plan, t0);
  console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`--- draft (${d.model}, ${d.plan.format}, ${d.plan.coreEmotion}, usedNews=${d.usedNews}) ---\nWOW: ${d.plan.wowFactor}\n${d.body}\nOTHER HOOKS: ${JSON.stringify(d.otherHooks)}\nLINT LEFT: ${JSON.stringify(d.lintLeft)}`);
}
