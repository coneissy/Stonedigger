import { Telegraf, Markup } from "telegraf";
import http from "node:http";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required");
const bot = new Telegraf(token);
const port = Number(process.env.PORT || 10000);
const PREMIUM_STARS = 1;
const DB_URL = process.env.STONEDIGGER_DB_URL;
const DB_SECRET = process.env.STONEDIGGER_DB_SECRET;
const OXSHARE_AFFILIATE_URL = "https://my.oxshare.com/register?referral=019ba1ff-6ca2-70b3-9def-036b59457426";
const COMMUNITY_URL = "https://t.me/ImperialEliteGoldskull";
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
function acquisitionKeyboard(referralLink) {
  return Markup.inlineKeyboard([
    [Markup.button.url("⛏️ Start Digging", `https://t.me/${referralLink.bot}?start=ref_${referralLink.code}`)],
    [Markup.button.url("📢 Join Community", COMMUNITY_URL)],
    [Markup.button.url("💰 Explore OxShare", OXSHARE_AFFILIATE_URL)]
  ]);
}
function affiliateKeyboard() { return Markup.inlineKeyboard([[Markup.button.url("💰 Visit OxShare", OXSHARE_AFFILIATE_URL)]]); }
async function getReferralLink(ctx) {
  const result = await dbRequest({ action: "get_referral", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
  const me = await bot.telegram.getMe();
  return { bot: me.username, code: result.referral_code, url: `https://t.me/${me.username}?start=ref_${result.referral_code}` };
}
async function referralShareKeyboard(ctx) {
  const ref = await getReferralLink(ctx);
  const shareText = encodeURIComponent("⛏️ Join me on StoneDigger! Start your daily dig and build your activity streak. Try it here:");
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(ref.url)}&text=${shareText}`;
  return Markup.inlineKeyboard([
    [Markup.button.url("📤 Invite Friends", shareUrl)],
    [Markup.button.url("👥 Community", COMMUNITY_URL)]
  ]);
}
async function showAffiliate(ctx, intro = false) {
  const text = intro ? "💰 Looking for an additional opportunity?\n\nStoneDigger has a separate OxShare affiliate link. If you want to learn more, you can visit OxShare below.\n\n⚠️ This is a third-party affiliate link. Trading involves risk and commissions depend on OxShare's terms and qualifying activity." : "💰 Want to explore OxShare?\n\nVisit through our affiliate link to learn more.\n\n⚠️ Third-party affiliate link. Trading involves risk; no earnings are guaranteed. If you sign up, review OxShare's terms and risks first.";
  return ctx.reply(text, affiliateKeyboard());
}

bot.start(async (ctx) => {
  await syncUser(ctx);
  const payload = ctx.startPayload || "";
  if (payload.startsWith("ref_")) {
    const code = payload.slice(4);
    const result = await dbRequest({ action: "apply_referral", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "", referral_code: code });
    if (result.result?.applied) {
      return ctx.reply("⛏️ Welcome to StoneDigger!\n\n✅ Referral linked successfully.\n\n🎯 Your first step: use /dig to start your daily activity.\n\n📤 Invite friends after your first dig to grow your referral count.", await referralShareKeyboard(ctx));
    }
  }
  return ctx.reply("⛏️ Welcome to StoneDigger!\n\n🎯 Start with /dig and build your daily streak.\n📤 Invite friends to grow your referral count.\n🏆 Check /leaderboard to see the competition.", await referralShareKeyboard(ctx));
});

bot.help((ctx) => ctx.reply("⛏️ StoneDigger\n\n/start — Start\n/dig — Daily dig\n/referral — Your referral link\n/affiliate — OxShare affiliate link\n/community — Join the community\n/leaderboard — Activity leaderboard\n/status — Account status\n/premium — Premium (1 ⭐ TEST)\n/terms — Terms\n/paysupport — Payment support"));

bot.command("dig", async (ctx) => {
  const result = await dbRequest({ action: "record_dig", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
  const dig = result.dig;
  if (!dig?.did_dig) return ctx.reply(`⛏️ You already dug today.\n📊 Activity: ${dig?.dig_count ?? 0}\n🔥 Streak: ${dig?.streak_count ?? 0}\n\nCome back tomorrow to keep your streak.`);
  const bonus = dig.premium ? "\n⭐ Premium bonus: +2 activity points." : "";
  const share = await referralShareKeyboard(ctx);
  if (dig.dig_count % 3 === 0) return ctx.reply(`⛏️ Dig complete!\n📊 Activity: ${dig.dig_count}\n🔥 Streak: ${dig.streak_count} day${dig.streak_count === 1 ? "" : "s"}.${bonus}\n\n🎉 Keep the streak going tomorrow!\n\n📤 Know someone who would enjoy StoneDigger? Invite them below.\n\n💰 Curious about OxShare? Use /affiliate.\n⚠️ Third-party affiliate link; trading involves risk.`, Markup.inlineKeyboard([...(share.reply_markup.inline_keyboard), [Markup.button.url("💰 Explore OxShare", OXSHARE_AFFILIATE_URL)]]));
  return ctx.reply(`⛏️ Dig complete!\n📊 Activity: ${dig.dig_count}\n🔥 Streak: ${dig.streak_count} day${dig.streak_count === 1 ? "" : "s"}.${bonus}\n\n📤 Invite friends and grow your referral count.`, share);
});

bot.command("referral", async (ctx) => {
  const ref = await getReferralLink(ctx);
  const shareText = encodeURIComponent("⛏️ Join me on StoneDigger! Start your daily dig and build your activity streak. Try it here:");
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(ref.url)}&text=${shareText}`;
  return ctx.reply(`🔗 Your StoneDigger referral link:\n${ref.url}\n\n📈 Share it with friends to grow your referral count.\n\n⚠️ Referral activity is tracked by StoneDigger; activity points are not cash and earnings are not guaranteed.`, Markup.inlineKeyboard([[Markup.button.url("📤 Invite Friends", shareUrl)], [Markup.button.url("👥 Join Community", COMMUNITY_URL)]]));
});

bot.command("affiliate", (ctx) => showAffiliate(ctx));
bot.command("community", (ctx) => ctx.reply(`👥 StoneDigger Community\n\nJoin the community here:\n${COMMUNITY_URL}`));

bot.command("leaderboard", async (ctx) => {
  const result = await dbRequest({ action: "leaderboard" });
  const rows = result.leaderboard || [];
  if (!rows.length) return ctx.reply("🏆 Leaderboard is empty. Be the first to dig!");
  const text = rows.map((u, i) => `${i + 1}. ${displayName(u)} — ${u.dig_count || 0} activity • 🔥${u.streak_count || 0} • 👥${u.referral_count || 0}`).join("\n");
  return ctx.reply(`🏆 StoneDigger Leaderboard\n\n${text}\n\n📤 Invite friends to grow your referral count.`);
});

bot.command("status", async (ctx) => {
  const result = await dbRequest({ action: "get_user", telegram_user_id: ctx.from.id });
  const user = result.user;
  if (!user) { await syncUser(ctx); return ctx.reply("⛏️ Free account. Use /premium to unlock Premium for 1 ⭐ (test).", affiliateKeyboard()); }
  const premium = user.premium ? "⭐ Premium active" : "⛏️ Free account";
  const feature = user.premium ? "Premium dig bonus: +2 activity points per daily dig." : "Premium adds +2 activity points per daily dig.";
  return ctx.reply(`${premium}\n\n📊 Activity: ${user.dig_count || 0}\n🔥 Streak: ${user.streak_count || 0}\n👥 Referrals: ${user.referral_count || 0}\n\n${feature}\n\n📤 Use /referral to invite friends.\n💰 Want to explore OxShare? Use /affiliate.`, affiliateKeyboard());
});

bot.command("premium", async (ctx) => {
  await syncUser(ctx);
  await ctx.replyWithInvoice({ title: "StoneDigger Premium (TEST)", description: "Test purchase: unlock StoneDigger Premium for 1 Telegram Star.", payload: "stonedigger-premium-v1", currency: "XTR", prices: [{ label: "Premium test", amount: PREMIUM_STARS }] });
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
  return ctx.reply("✅ Test payment received!\n⭐ 1 Star confirmed.\n🚀 StoneDigger Premium is unlocked.\n\nOnce verified, switch the price from 1 Star to the real launch price.");
});

bot.command("terms", (ctx) => ctx.reply("📜 StoneDigger Terms\n\nStoneDigger is an activity and referral bot. Activity points and leaderboard positions are not cash and do not guarantee earnings. Premium is currently a 1-Star test digital feature. After payment testing, the launch price should be configured. Affiliate links are third-party links and any commissions depend on the affiliate program's terms. Use the bot responsibly and do not spam referrals."));
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
    { command: "start", description: "Start StoneDigger" }, { command: "help", description: "Show help" }, { command: "dig", description: "Daily dig" }, { command: "referral", description: "Invite friends" }, { command: "affiliate", description: "OxShare affiliate link" }, { command: "community", description: "Join the community" }, { command: "leaderboard", description: "Activity leaderboard" }, { command: "status", description: "Account status" }, { command: "premium", description: "Premium — 1 Star TEST" }, { command: "terms", description: "Terms" }, { command: "paysupport", description: "Payment support" }
  ]);
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) { await bot.telegram.setWebhook(`${webhookUrl.replace(/\/$/, "")}/telegram/webhook`); console.log("Webhook set"); }
  else console.log("WEBHOOK_URL not set yet");
});
