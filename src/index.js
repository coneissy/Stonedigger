import { Telegraf } from "telegraf";
import http from "node:http";
import fs from "node:fs";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required");

const bot = new Telegraf(token);
const port = Number(process.env.PORT || 10000);
const PREMIUM_STARS = 100;
const DATA_FILE = process.env.DATA_FILE || "/tmp/stonedigger-data.json";

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return { users: {}, payments: {} }; }
}
function saveData(data) {
  try { fs.mkdirSync(DATA_FILE.substring(0, DATA_FILE.lastIndexOf("/")), { recursive: true }); } catch {}
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
const data = loadData();

function userKey(id) { return String(id); }
function ensureUser(ctx) {
  const key = userKey(ctx.from.id);
  if (!data.users[key]) data.users[key] = { id: ctx.from.id, firstName: ctx.from.first_name || "", username: ctx.from.username || "", premium: false, createdAt: new Date().toISOString() };
  else { data.users[key].firstName = ctx.from.first_name || data.users[key].firstName; data.users[key].username = ctx.from.username || data.users[key].username; }
  return data.users[key];
}

bot.start((ctx) => { ensureUser(ctx); saveData(data); return ctx.reply("⛏️ Welcome to StoneDigger!\n\nUse /help to see what you can do."); });

bot.help((ctx) => ctx.reply("⛏️ StoneDigger\n\n/start — Start\n/help — Help\n/premium — Premium (100 ⭐)\n/status — Check Premium status\n/paysupport — Payment support"));

bot.command("status", (ctx) => {
  const user = ensureUser(ctx); saveData(data);
  return ctx.reply(user.premium ? "⭐ Premium is active on your StoneDigger account." : "⛏️ Free account. Use /premium to unlock Premium for 100 ⭐.");
});

bot.command("premium", async (ctx) => {
  ensureUser(ctx); saveData(data);
  await ctx.replyWithInvoice({
    title: "StoneDigger Premium",
    description: "Unlock StoneDigger Premium features.",
    payload: "stonedigger-premium-v1",
    currency: "XTR",
    prices: [{ label: "Premium", amount: PREMIUM_STARS }]
  });
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
  const chargeId = payment.telegram_payment_charge_id;
  if (!data.payments[chargeId]) {
    data.payments[chargeId] = { userId: ctx.from.id, stars: payment.total_amount, currency: payment.currency, payload: payment.invoice_payload, chargeId, paidAt: new Date().toISOString() };
    const user = ensureUser(ctx);
    user.premium = true;
    user.premiumSince = user.premiumSince || new Date().toISOString();
    saveData(data);
  }
  await ctx.reply("✅ Payment received!\n⭐ 100 Stars confirmed.\n🚀 StoneDigger Premium is unlocked.\n\nThank you for supporting StoneDigger!");
});

bot.command("paysupport", (ctx) => ctx.reply("For payment support, contact the bot owner."));

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("StoneDigger is running");
    return;
  }
  if (req.method === "POST" && req.url === "/telegram/webhook") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try { await bot.handleUpdate(JSON.parse(body)); res.writeHead(200); res.end("OK"); }
      catch (error) { console.error(error); res.writeHead(500); res.end("ERROR"); }
    });
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
