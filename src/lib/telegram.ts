const API = "https://api.telegram.org";

export function chunkText(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n\n", limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(" ", limit);
    if (cut <= 0) cut = limit;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/** Sends plain text (no parse_mode, so drafts can't break on stray markdown). Returns the first message id. */
export async function sendMessage(chatId: number, text: string, replyTo?: number): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  let firstId: number | null = null;
  for (const part of chunkText(text)) {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: part,
        disable_web_page_preview: true,
        ...(replyTo && firstId === null ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {}),
      }),
    });
    const json = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!json.ok) throw new Error(`Telegram sendMessage failed: ${json.description ?? res.status}`);
    if (firstId === null) firstId = json.result?.message_id ?? null;
  }
  return firstId;
}
