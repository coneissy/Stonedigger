import { Telegraf } from "telegraf";
import http from "node:http";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required");
const bot = new Telegraf(token);
const port = Number(process.env.PORT || 10000);
const PREMIUM_STARS = 100;
const DB_URL = process.env.STONEDIGGER_DB_URL;
const DB_SECRET = process.env.STONEDIGGER_DB_SECRET;
if (!DB_URL || !DB_SECRET) throw new Error("STONEDIGGER_DB_URL and STONEDIGGER_DB_SECRET are required");

async function dbRequest(body) {
  const response = await fetch(DB_URL, { method: "POST", headers: { "content-type": "application/json", "x-stonedigger-secret": DB_SECRET }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `StoneDigger DB request failed (${response.status})`);
  return result;
}
async function syncUser(ctx) {
  return dbRequest({ action: "upsert_user", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
}
function displayName(user) { return user.username ? `@${user.username}` : (user.first_name || "Player"); }

bot.start(async (ctx) => {
  await syncUser(ctx);
  const payload = ctx.startPayload || "";
  if (payload.startsWith("ref_")) {
    const code = payload.slice(4);
    const result = await dbRequest({ action: "apply_referral", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "", referral_code: code });
    if (result.result?.applied) return ctx.reply("⛏️ Welcome to StoneDigger!\n\n✅ Referral linked successfully.\nUse /dig to start your daily activity.");
  }
  return ctx.reply("⛏️ Welcome to StoneDigger!\n\nUse /help to see what you can do.");
});

bot.help((ctx) => ctx.reply("⛏️ StoneDigger\n\n/start — Start\n/dig — Daily dig\n/referral — Your referral link\n/leaderboard — Activity leaderboard\n/status — Account status\n/premium — Premium (100 ⭐)\n/terms — Terms\n/paysupport — Payment support"));

bot.command("dig", async (ctx) => {
  const result = await dbRequest({ action: "record_dig", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
  const dig = result.dig;
  if (!dig?.did_dig) return ctx.reply(`⛏️ You already dug today.\n📊 Activity: ${dig?.dig_count ?? 0}\n🔥 Streak: ${dig?.streak_count ?? 0}`);
  const bonus = dig.premium ? "\n⭐ Premium bonus: +2 activity points." : "";
  return ctx.reply(`⛏️ Dig complete!\n📊 Activity: ${dig.dig_count}\n🔥 Streak: ${dig.streak_count} day${dig.streak_count === 1 ? "" : "s"}.${bonus}\n\nCome back tomorrow to keep your streak.`);
});

bot.command("referral", async (ctx) => {
  const result = await dbRequest({ action: "get_referral", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
  const me = await bot.telegram.getMe();
  const link = `https://t.me/${me.username}?start=ref_${result.referral_code}`;
  return ctx.reply(`🔗 Your StoneDigger referral link:\n${link}\n\nShare it with friends to grow your referral count.`);
});

bot.command("leaderboard", async (ctx) => {
  const result = await dbRequest({ action: "leaderboard" });
  const rows = result.leaderboard || [];
  if (!rows.length) return ctx.reply("🏆 Leaderboard is empty. Be the first to dig!");
  const text = rows.map((u, i) => `${i + 1}. ${displayName(u)} — ${u.dig_count || 0} activity • 🔥${u.streak_count || 0} • 👥${u.referral_count || 0}`).join("\n");
  return ctx.reply(`🏆 StoneDigger Leaderboard\n\n${text}`);
});

bot.command("status", async (ctx) => {
  const result = await dbRequest({ action: "get_user", telegram_user_id: ctx.from.id });
  const user = result.user;
  if (!user) { await syncUser(ctx); return ctx.reply("⛏️ Free account. Use /premium to unlock Premium for 100 ⭐."); }
  const premium = user.premium ? "⭐ Premium active" : "⛏️ Free account";
  const feature = user.premium ? "Premium dig bonus: +2 activity points per daily dig." : "Premium adds +2 activity points per daily dig.";
  return ctx.reply(`${premium}\n\n📊 Activity: ${user.dig_count || 0}\n🔥 Streak: ${user.streak_count || 0}\n👥 Referrals: ${user.referral_count || 0}\n\n${feature}`);
});

bot.command("premium", async (ctx) => {
  await syncUser(ctx);
  await ctx.replyWithInvoice({ title: "StoneDigger Premium", description: "Unlock StoneDigger Premium features.", payload: "stonedigger-premium-v1", currency: "XTR", prices: [{ label: "Premium", amount: PREMIUM_STARS }] });
});

bot.on("pre_checkout_query", async (ctx) => {
  const query = ctx.update.pre_checkout_query;
  if (query.invoice_payload !== "stonedigger-premium-v1" || query.currency !== "XTR" || query.total_amount !== PREMIUM_STARS) return ctx.answerPreCheckoutQuery(false, "This Premium order is no longer valid.");
  return ctx.answerPreCheckoutQuery(true);
});

bot.on("successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  if (payment.invoice_payload !== "stonedigger-premium-v1") return;
  const result = await dbRequest({ action: "record_payment", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "", charge_id: payment.telegram_payment_charge_id, stars: payment.total_amount, currency: payment.currency, payload: payment.invoice_payload });
  if (result.duplicate) return ctx.reply("ℹ️ This payment was already recorded.\n⭐ Premium remains active on your account.");
  return ctx.reply("✅ Payment received!\n⭐ 100 Stars confirmed.\n🚀 StoneDigger Premium is unlocked.\n\nThank you for supporting StoneDigger!");
});

bot.command("terms", (ctx) => ctx.reply("📜 StoneDigger Terms\n\nStoneDigger is an activity and referral bot. Activity points and leaderboard positions are not cash and do not guarantee earnings. Premium is a paid digital feature for 100 Telegram Stars. Use the bot responsibly and do not spam referrals."));
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
  await bot.telegram.setMyCommands([
    { command: "start", description: "Start StoneDigger" }, { command: "help", description: "Show help" }, { command: "dig", description: "Daily dig" }, { command: "referral", description: "Get referral link" }, { command: "leaderboard", description: "Activity leaderboard" }, { command: "status", description: "Account status" }, { command: "premium", description: "Premium — 100 Stars" }, { command: "terms", description: "Terms" }, { command: "paysupport", description: "Payment support" }
  ]);
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) { await bot.telegram.setWebhook(`${webhookUrl.replace(/\/$/, "")}/telegram/webhook`); console.log("Webhook set"); }
  else console.log("WEBHOOK_URL not set yet");
});
