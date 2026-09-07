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
  const response = await fetch(DB_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-stonedigger-secret": DB_SECRET },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `StoneDigger DB request failed (${response.status})`);
  return result;
}

async function syncUser(ctx) {
  return dbRequest({ action: "upsert_user", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
}

function displayName(user) { return user.username ? `@${user.username}` : (user.first_name || "Player"); }

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⛏️ DIG NOW", "dig_now")],
    [Markup.button.callback("📤 INVITE FRIENDS", "invite_friends")],
    [Markup.button.callback("⭐ PREMIUM", "premium_info")],
    [Markup.button.callback("🏆 LEADERBOARD", "leaderboard_now")]
  ]);
}

function postDigKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📤 INVITE FRIENDS", "invite_friends")],
    [Markup.button.callback("🏆 LEADERBOARD", "leaderboard_now")],
    [Markup.button.callback("⭐ PREMIUM", "premium_info")]
  ]);
}

function affiliateKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.url("💰 Visit OxShare", OXSHARE_AFFILIATE_URL)]]);
}

async function getReferralLink(ctx) {
  const result = await dbRequest({ action: "get_referral", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
  const me = await bot.telegram.getMe();
  return { bot: me.username, code: result.referral_code, url: `https://t.me/${me.username}?start=ref_${result.referral_code}` };
}

async function referralShareKeyboard(ctx) {
  const ref = await getReferralLink(ctx);
  const shareText = encodeURIComponent("⛏️ Join me on StoneDigger! Tap DIG NOW and start your daily streak:");
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(ref.url)}&text=${shareText}`;
  return Markup.inlineKeyboard([
    [Markup.button.url("📤 SHARE WITH FRIENDS", shareUrl)],
    [Markup.button.callback("⛏️ DIG NOW", "dig_now")]
  ]);
}

async function performDig(ctx) {
  const result = await dbRequest({ action: "record_dig", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
  const dig = result.dig;
  if (!dig?.did_dig) {
    return ctx.reply(`⏳ You already dug today!\n\n📊 Activity: ${dig?.dig_count ?? 0}\n🔥 Streak: ${dig?.streak_count ?? 0}\n\nCome back tomorrow to keep your streak.`, postDigKeyboard());
  }
  const bonus = dig.premium ? "\n⭐ Premium bonus: +2 activity points." : "";
  return ctx.reply(`🎉 DIG COMPLETE!\n\n📊 Activity: ${dig.dig_count}\n🔥 Streak: ${dig.streak_count} day${dig.streak_count === 1 ? "" : "s"}.${bonus}\n\nYour next move: invite a friend and keep growing StoneDigger.`, postDigKeyboard());
}

async function showPremium(ctx) {
  return ctx.reply(`⭐ StoneDigger Premium\n\nGet +2 activity points on every daily dig.\n\n🧪 TEST PRICE: 1 Telegram Star\n\nStart with the free daily dig first.`, Markup.inlineKeyboard([
    [Markup.button.callback("⭐ BUY PREMIUM — 1 STAR", "buy_premium")],
    [Markup.button.callback("⛏️ DIG NOW", "dig_now")]
  ]));
}

async function showReferral(ctx) {
  const ref = await getReferralLink(ctx);
  const shareText = encodeURIComponent("⛏️ Join me on StoneDigger! Tap DIG NOW and start your daily streak:");
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(ref.url)}&text=${shareText}`;
  return ctx.reply(`👥 INVITE FRIENDS\n\nShare StoneDigger with your friends and grow your referral count.\n\n🔗 ${ref.url}\n\n⚠️ Referral activity is tracked by StoneDigger. Activity points are not cash and earnings are not guaranteed.`, Markup.inlineKeyboard([
    [Markup.button.url("📤 SHARE WITH FRIENDS", shareUrl)],
    [Markup.button.callback("⛏️ DIG NOW", "dig_now")]
  ]));
}

async function showLeaderboard(ctx) {
  const result = await dbRequest({ action: "leaderboard" });
  const rows = result.leaderboard || [];
  if (!rows.length) return ctx.reply("🏆 No players yet. Be the first to dig!", mainKeyboard());
  const text = rows.map((u, i) => `${i + 1}. ${displayName(u)} — ${u.dig_count || 0} activity • 🔥${u.streak_count || 0} • 👥${u.referral_count || 0}`).join("\n");
  return ctx.reply(`🏆 STONEDIGGER LEADERBOARD\n\n${text}\n\n📤 Invite friends to grow your referral count.`, mainKeyboard());
}

async function showAffiliate(ctx) {
  return ctx.reply("💰 Want to explore OxShare?\n\nThis is a separate third-party affiliate offer. Review the service, terms and risks before signing up. No earnings are guaranteed.", affiliateKeyboard());
}

bot.start(async (ctx) => {
  await syncUser(ctx);
  const payload = ctx.startPayload || "";
  if (payload.startsWith("ref_")) {
    const code = payload.slice(4);
    const result = await dbRequest({ action: "apply_referral", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "", referral_code: code });
    if (result.result?.applied) {
      return ctx.reply("⛏️ WELCOME TO STONEDIGGER!\n\nYour referral is linked.\n\n👇 Tap the button below to make your first dig.", mainKeyboard());
    }
  }
  return ctx.reply("⛏️ WELCOME TO STONEDIGGER!\n\nOne tap. One daily dig. Build your streak.\n\n👇 START HERE:", mainKeyboard());
});

bot.help((ctx) => ctx.reply("⛏️ StoneDigger\n\nTap DIG NOW to play.\n\n/dig — Daily dig\n/referral — Invite friends\n/premium — Premium\n/leaderboard — Leaderboard\n/status — Account status\n/affiliate — OxShare affiliate\n/community — Community\n/terms — Terms\n/paysupport — Payment support", mainKeyboard()));

bot.action("dig_now", async (ctx) => {
  await ctx.answerCbQuery();
  return performDig(ctx);
});

bot.action("invite_friends", async (ctx) => {
  await ctx.answerCbQuery();
  return showReferral(ctx);
});

bot.action("premium_info", async (ctx) => {
  await ctx.answerCbQuery();
  return showPremium(ctx);
});

bot.action("buy_premium", async (ctx) => {
  await ctx.answerCbQuery();
  await syncUser(ctx);
  return ctx.replyWithInvoice({
    title: "StoneDigger Premium (TEST)",
    description: "Test purchase: unlock StoneDigger Premium for 1 Telegram Star.",
    payload: "stonedigger-premium-v1",
    currency: "XTR",
    prices: [{ label: "Premium test", amount: PREMIUM_STARS }]
  });
});

bot.action("leaderboard_now", async (ctx) => {
  await ctx.answerCbQuery();
  return showLeaderboard(ctx);
});

bot.command("dig", async (ctx) => performDig(ctx));
bot.command("referral", async (ctx) => showReferral(ctx));
bot.command("affiliate", async (ctx) => showAffiliate(ctx));
bot.command("community", (ctx) => ctx.reply(`👥 StoneDigger Community\n\nJoin the community here:\n${COMMUNITY_URL}`));
bot.command("leaderboard", async (ctx) => showLeaderboard(ctx));

bot.command("status", async (ctx) => {
  const result = await dbRequest({ action: "get_user", telegram_user_id: ctx.from.id });
  const user = result.user;
  if (!user) { await syncUser(ctx); return ctx.reply("⛏️ Free account.\n\nStart your daily dig below.", mainKeyboard()); }
  const premium = user.premium ? "⭐ Premium active" : "⛏️ Free account";
  const feature = user.premium ? "Premium dig bonus: +2 activity points per daily dig." : "Premium adds +2 activity points per daily dig.";
  return ctx.reply(`${premium}\n\n📊 Activity: ${user.dig_count || 0}\n🔥 Streak: ${user.streak_count || 0}\n👥 Referrals: ${user.referral_count || 0}\n\n${feature}`, mainKeyboard());
});

bot.command("premium", async (ctx) => showPremium(ctx));

bot.on("pre_checkout_query", async (ctx) => {
  const query = ctx.update.pre_checkout_query;
  if (query.invoice_payload !== "stonedigger-premium-v1" || query.currency !== "XTR" || query.total_amount !== PREMIUM_STARS) return ctx.answerPreCheckoutQuery(false, "This Premium order is no longer valid.");
  return ctx.answerPreCheckoutQuery(true);
});

bot.on("successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  if (payment.invoice_payload !== "stonedigger-premium-v1") return;
  const result = await dbRequest({ action: "record_payment", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "", charge_id: payment.telegram_payment_charge_id, stars: payment.total_amount, currency: payment.currency, payload: payment.invoice_payload });
  if (result.duplicate) return ctx.reply("ℹ️ This payment was already recorded.\n⭐ Premium remains active on your account.", mainKeyboard());
  return ctx.reply("✅ Payment received!\n⭐ 1 Star confirmed.\n🚀 Premium is unlocked.", mainKeyboard());
});

bot.command("terms", (ctx) => ctx.reply("📜 StoneDigger Terms\n\nStoneDigger is an activity and referral bot. Activity points and leaderboard positions are not cash and do not guarantee earnings. Premium is currently a 1-Star test digital feature. Affiliate links are third-party links and any commissions depend on the affiliate program's terms. Use the bot responsibly and do not spam referrals."));
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
    { command: "start", description: "Start StoneDigger" },
    { command: "dig", description: "Daily dig" },
    { command: "referral", description: "Invite friends" },
    { command: "premium", description: "Premium — 1 Star TEST" },
    { command: "leaderboard", description: "Leaderboard" },
    { command: "status", description: "Account status" },
    { command: "affiliate", description: "OxShare affiliate" },
    { command: "community", description: "Join community" },
    { command: "help", description: "Help" },
    { command: "terms", description: "Terms" },
    { command: "paysupport", description: "Payment support" }
  ]);
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) { await bot.telegram.setWebhook(`${webhookUrl.replace(/\/$/, "")}/telegram/webhook`); console.log("Webhook set"); }
  else console.log("WEBHOOK_URL not set yet");
});
