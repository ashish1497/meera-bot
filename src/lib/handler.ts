import { sql } from "@/lib/db";
import { sendMessage } from "@/lib/telegram";
import { parseDecision } from "@/lib/commands";
import { SCORE_THRESHOLD, scoreNote, findNews, writeDraft } from "@/lib/pipeline";

export type TgMessage = {
  message_id: number;
  chat: { id: number };
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number };
};
export type TgUpdate = { update_id: number; message?: TgMessage; channel_post?: TgMessage };

/** Handles one Telegram update end to end. Never throws to the webhook: failures are reported back in chat. */
export async function handleUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message ?? update.channel_post;
  const text = (msg?.text ?? msg?.caption ?? "").trim();
  if (!msg || !text) return;

  const chatId = msg.chat.id;
  const allowed = process.env.ALLOWED_CHAT_ID;
  if (allowed && String(chatId) !== allowed) return;

  const db = sql();
  const decision = parseDecision(text);
  if (decision) return handleDecision(chatId, msg, decision);

  if (text.startsWith("/")) {
    await sendMessage(chatId, "Send me a note as plain text and I will screen it and draft a post. Reply APPROVE or REJECT to a draft when you have decided.");
    return;
  }

  const inserted = await db`
    insert into notes (telegram_update_id, chat_id, message_id, text)
    values (${update.update_id}, ${chatId}, ${msg.message_id}, ${text})
    on conflict (telegram_update_id) do nothing
    returning id`;
  if (inserted.length === 0) return; // Telegram retry of an update we already handled
  const noteId = inserted[0].id as number;

  try {
    const { score, reason } = await scoreNote(text);
    if (score < SCORE_THRESHOLD) {
      await db`update notes set score = ${score}, score_reason = ${reason}, outcome = 'scored_out' where id = ${noteId}`;
      await sendMessage(chatId, `No draft this time. Score ${score}/10: ${reason}\n\nThe note is saved. Add a specific example or number and send it again.`, msg.message_id);
      return;
    }
    await db`update notes set score = ${score}, score_reason = ${reason} where id = ${noteId}`;

    const { news } = await findNews(text);
    const draft = await writeDraft(text, news);
    const hooks = draft.otherHooks.length
      ? `\n\nOther hooks to try:\n${draft.otherHooks.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
      : "";
    const tgId = await sendMessage(
      chatId,
      `${draft.body}${hooks}\n\n(Score ${score}/10. Reply APPROVE or REJECT to this message.)`,
      msg.message_id
    );
    const meta = { format: draft.plan.format, coreEmotion: draft.plan.coreEmotion, wowFactor: draft.plan.wowFactor, hooks: draft.plan.hooks, lintLeft: draft.lintLeft };
    await db`
      insert into drafts (note_id, body, news, model, status, telegram_message_id, meta)
      values (${noteId}, ${draft.body}, ${draft.usedNews && news ? db.json(news as never) : null}, ${draft.model}, 'pending', ${tgId}, ${db.json(meta as never)})`;
    await db`update notes set outcome = 'drafted' where id = ${noteId}`;
  } catch (err) {
    console.error("[meera-bot] pipeline failed:", err);
    await db`update notes set outcome = 'error' where id = ${noteId}`;
    await sendMessage(chatId, "Something broke while drafting. Your note is saved. Send it again in a minute.", msg.message_id).catch(() => {});
  }
}

async function handleDecision(chatId: number, msg: TgMessage, decision: "approved" | "rejected") {
  const db = sql();
  const replyTo = msg.reply_to_message?.message_id;
  const rows = replyTo
    ? await db`select d.id from drafts d join notes n on n.id = d.note_id
               where n.chat_id = ${chatId} and d.telegram_message_id = ${replyTo} and d.status = 'pending'`
    : await db`select d.id from drafts d join notes n on n.id = d.note_id
               where n.chat_id = ${chatId} and d.status = 'pending' order by d.created_at desc limit 1`;
  if (rows.length === 0) {
    await sendMessage(chatId, "No pending draft to update. Reply directly to a draft message, or send a new note.", msg.message_id);
    return;
  }
  await db`update drafts set status = ${decision}, decided_at = now() where id = ${rows[0].id}`;
  await sendMessage(
    chatId,
    decision === "approved"
      ? "Marked approved. Copy it, check the news source if there is one, and publish it yourself."
      : "Marked rejected. Kept for reference so we can see what to improve.",
    msg.message_id
  );
}
