// usage: npm run webhook -- https://your-project.vercel.app
process.loadEnvFile(".env.local");
const base = process.argv[2]?.replace(/\/$/, "");
if (!base) throw new Error("Pass the Vercel URL: npm run webhook -- https://your-project.vercel.app");
const token = process.env.TELEGRAM_BOT_TOKEN!;
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${base}/api/webhook`,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "channel_post"],
    drop_pending_updates: true,
  }),
});
console.log(await res.json());
const info = await (await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json();
console.log(JSON.stringify(info, null, 2));
