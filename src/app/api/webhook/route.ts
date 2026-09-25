import { after } from "next/server";
import { handleUpdate, type TgUpdate } from "@/lib/handler";

export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await req.json()) as TgUpdate;
  // Answer Telegram immediately so it does not retry; do the slow work after the response.
  after(() => handleUpdate(update).catch((e) => console.error("[meera-bot] handleUpdate failed:", e)));
  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json({ ok: true, service: "meera-bot" });
}
