import { Telegraf } from "telegraf";
import http from "node:http";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required");

const bot = new Telegraf(token);
const port = Number(process.env.PORT || 10000);
const PREMIUM_STARS = 1;
const DB_URL = process.env.STONEDIGGER_DB_URL;
const DB_SECRET = process.env.STONEDIGGER_DB_SECRET;
if (!DB_URL || !DB_SECRET) throw new Error("STONEDIGGER_DB_URL and STONEDIGGER_DB_SECRET are required");

async function dbRequest(body) {
  const response = await fetch(DB_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-stonedigger-secret": DB_SECRET },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `StoneDigger DB request failed (${response.status})`);
  return result;
}

async function syncUser(ctx) {
  return dbRequest({ action: "upsert_user", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
}

bot.start(async (ctx) => { await syncUser(ctx); return ctx.reply("⛏️ Welcome to StoneDigger!\n\nUse /help to see what you can do."); });
bot.help((ctx) => ctx.reply("⛏️ StoneDigger\n\n/start — Start\n/help — Help\n/premium — Premium (1 ⭐ TEST)\n/status — Check Premium status\n/paysupport — Payment support"));

bot.command("status", async (ctx) => {
  const result = await dbRequest({ action: "get_user", telegram_user_id: ctx.from.id });
  const user = result.user;
  if (!user) { await syncUser(ctx); return ctx.reply("⛏️ Free account. Use /premium to unlock Premium for 1 ⭐ TEST."); }
  return ctx.reply(user.premium ? "⭐ Premium is active on your StoneDigger account." : "⛏️ Free account. Use /premium to unlock Premium for 1 ⭐ TEST.");
});

bot.command("premium", async (ctx) => {
  await syncUser(ctx);
  await ctx.replyWithInvoice({ title: "StoneDigger Premium (TEST)", description: "Test StoneDigger Premium for 1 Telegram Star.", payload: "stonedigger-premium-v1", currency: "XTR", prices: [{ label: "Premium TEST", amount: PREMIUM_STARS }] });
});

bot.on("pre_checkout_query", async (ctx) => {
  const query = ctx.update.pre_checkout_query;
  if (query.invoice_payload !== "stonedigger-premium-v1" || query.currency !== "XTR" || query.total_amount !== PREMIUM_STARS) {
    await ctx.answerPreCheckoutQuery(false, "This Premium order is no longer valid.");
    return;
  }
  await ctx.answerPreCheckoutQuery(true);
});

bot.on("successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  if (payment.invoice_payload !== "stonedigger-premium-v1") return;
  const result = await dbRequest({ action: "record_payment", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "", charge_id: payment.telegram_payment_charge_id, stars: payment.total_amount, currency: payment.currency, payload: payment.invoice_payload });
  if (result.duplicate) { await ctx.reply("ℹ️ This payment was already recorded.\n⭐ Premium remains active on your account."); return; }
  await ctx.reply("✅ Test payment received!\n⭐ 1 Star confirmed.\n🚀 StoneDigger Premium is unlocked.");
});

bot.command("paysupport", (ctx) => ctx.reply("For payment support, contact the bot owner."));

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") { res.writeHead(200, { "content-type": "text/plain" }); res.end("StoneDigger is running"); return; }
  if (req.method === "POST" && req.url === "/telegram/webhook") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => { try { await bot.handleUpdate(JSON.parse(body)); res.writeHead(200); res.end("OK"); } catch (error) { console.error(error); res.writeHead(500); res.end("ERROR"); } });
    return;
  }
  res.writeHead(404); res.end("Not found");
});

server.listen(port, async () => {
  console.log(`HTTP server listening on ${port}`);
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) { await bot.telegram.setWebhook(`${webhookUrl.replace(/\/$/, "")}/telegram/webhook`); console.log("Webhook set"); }
  else console.log("WEBHOOK_URL not set yet");
});
