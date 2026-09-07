import { Telegraf, Markup } from "telegraf";
import crypto from "node:crypto";
import http from "node:http";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required");
const bot = new Telegraf(token);
const port = Number(process.env.PORT || 10000);
const PREMIUM_STARS = 100;
const DB_URL = process.env.STONEDIGGER_DB_URL;
const DB_SECRET = process.env.STONEDIGGER_DB_SECRET;
const OXSHARE_AFFILIATE_URL = "https://my.oxshare.com/register?referral=019ba1ff-6ca2-70b3-9def-036b59457426";
const FXPRO_AFFILIATE_URL = "https://direct-fxpro.com/en/partner/2vZ2oa192?platform=web";
const COMMUNITY_URL = "https://t.me/ImperialEliteGoldskull";
const FACEBOOK_VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || "";
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const FACEBOOK_GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
if (!DB_URL || !DB_SECRET) throw new Error("STONEDIGGER_DB_URL and STONEDIGGER_DB_SECRET are required");

async function dbRequest(body) {
  const response = await fetch(DB_URL, { method: "POST", headers: { "content-type": "application/json", "x-stonedigger-secret": DB_SECRET }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `StoneDigger DB request failed (${response.status})`);
  return result;
}
async function syncUser(ctx) { return dbRequest({ action: "upsert_user", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" }); }
function displayName(user) { return user.username ? `@${user.username}` : (user.first_name || "Player"); }

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⛏️ DIG NOW", "dig_now")],
    [Markup.button.callback("📤 INVITE FRIENDS", "invite_friends")],
    [Markup.button.callback("⭐ PREMIUM — 100 STARS", "premium_info")],
    [Markup.button.callback("🏆 LEADERBOARD", "leaderboard_now")],
    [Markup.button.url("💰 OXSHARE OPPORTUNITY", OXSHARE_AFFILIATE_URL)]
  ]);
}
function postDigKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📤 INVITE FRIENDS", "invite_friends")],
    [Markup.button.callback("🏆 LEADERBOARD", "leaderboard_now")],
    [Markup.button.callback("⭐ PREMIUM — 100 STARS", "premium_info")],
    [Markup.button.url("💰 OXSHARE OPPORTUNITY", OXSHARE_AFFILIATE_URL)],
    [Markup.button.callback("🏠 HOME", "home_now")]
  ]);
}

async function getReferralLink(ctx) {
  const result = await dbRequest({ action: "get_referral", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
  const me = await bot.telegram.getMe();
  return { bot: me.username, code: result.referral_code, url: `https://t.me/${me.username}?start=ref_${result.referral_code}` };
}

async function performDig(ctx) {
  const result = await dbRequest({ action: "record_dig", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "" });
  const dig = result.dig || {};
  if (!dig.did_dig) return ctx.reply(`⏳ YOU ALREADY DUG TODAY!\n\n📊 Activity: ${dig.dig_count ?? 0}\n🔥 Streak: ${dig.streak_count ?? 0}\n\nCome back tomorrow to keep your streak alive.`, postDigKeyboard());
  const bonus = dig.premium ? "\n⭐ Premium bonus: +2 activity points." : "";
  const streak = dig.streak_count || 1;
  const activity = dig.dig_count || 0;
  const milestone = streak >= 7 ? "🏅 7-DAY STREAK!" : streak >= 3 ? "🔥 GREAT STREAK!" : "🚀 KEEP GOING!";
  if (activity % 3 === 0) return ctx.reply(`⛏️ DIG COMPLETE!\n\n🎉 Daily dig counted\n📊 Activity: ${activity}\n🔥 Streak: ${streak} day${streak === 1 ? "" : "s"}${bonus}\n\n${milestone}\n\n💰 Want to explore the separate OxShare opportunity? Tap the button below.\n⚠️ Third-party affiliate link; trading involves risk and no earnings are guaranteed.`, postDigKeyboard());
  return ctx.reply(`⛏️ DIG COMPLETE!\n\n🎉 Daily dig counted\n📊 Activity: ${activity}\n🔥 Streak: ${streak} day${streak === 1 ? "" : "s"}${bonus}\n\n${milestone}\n\n👥 Next: invite a friend and grow your StoneDigger network.`, postDigKeyboard());
}

async function showHome(ctx, welcome = false) {
  const result = await dbRequest({ action: "get_user", telegram_user_id: ctx.from.id });
  const user = result.user || {};
  const premium = user.premium ? "⭐ PREMIUM" : "⛏️ FREE";
  return ctx.reply(`${welcome ? "⛏️ WELCOME TO STONEDIGGER" : "⛏️ STONEDIGGER DASHBOARD"}\n\n${premium}\n📊 Activity: ${user.dig_count || 0}\n🔥 Streak: ${user.streak_count || 0}\n👥 Referrals: ${user.referral_count || 0}\n\n🎯 TAP DIG NOW TO PLAY.\n💰 Explore the separate OxShare opportunity below.`, mainKeyboard());
}

async function showReferral(ctx) {
  const ref = await getReferralLink(ctx);
  const shareText = encodeURIComponent("⛏️ Join me on StoneDigger! Tap DIG NOW and start your daily streak:");
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(ref.url)}&text=${shareText}`;
  const result = await dbRequest({ action: "get_user", telegram_user_id: ctx.from.id });
  const count = result.user?.referral_count || 0;
  return ctx.reply(`👥 INVITE FRIENDS\n\nYour referrals: ${count}\n\nShare your personal invite and bring friends into StoneDigger.\n\n🔗 ${ref.url}\n\n⚠️ Activity points are not cash and earnings are not guaranteed.\n\n💰 You can also explore our separate OxShare affiliate opportunity below.`, Markup.inlineKeyboard([
    [Markup.button.url("📤 SHARE INVITE", shareUrl)],
    [Markup.button.url("💰 VISIT OXSHARE", OXSHARE_AFFILIATE_URL)],
    [Markup.button.callback("⛏️ DIG NOW", "dig_now"), Markup.button.callback("🏆 RANK", "leaderboard_now")],
    [Markup.button.callback("🏠 HOME", "home_now")]
  ]));
}

async function showLeaderboard(ctx) {
  const result = await dbRequest({ action: "leaderboard" });
  const rows = result.leaderboard || [];
  if (!rows.length) return ctx.reply("🏆 TOP DIGGERS\n\nNo players yet. Be the first to dig!", mainKeyboard());
  const text = rows.slice(0, 10).map((u, i) => `${i + 1}. ${displayName(u)} — ⛏️${u.dig_count || 0} • 🔥${u.streak_count || 0}`).join("\n");
  return ctx.reply(`🏆 TOP DIGGERS\n\n${text}\n\n📤 Invite friends and climb the board.`, Markup.inlineKeyboard([
    [Markup.button.callback("⛏️ DIG NOW", "dig_now"), Markup.button.callback("📤 INVITE", "invite_friends")],
    [Markup.button.url("💰 OXSHARE OPPORTUNITY", OXSHARE_AFFILIATE_URL)],
    [Markup.button.callback("🏠 HOME", "home_now")]
  ]));
}

async function showPremium(ctx) {
  return ctx.reply("⭐ STONEDIGGER PREMIUM\n\nGet +2 activity points on every daily dig.\n\n💎 PRICE: 100 Telegram Stars\n\nStart free, then upgrade when you want more activity.", Markup.inlineKeyboard([
    [Markup.button.callback("⭐ BUY PREMIUM — 100 STARS", "buy_premium")],
    [Markup.button.callback("⛏️ DIG NOW", "dig_now")],
    [Markup.button.url("💰 OXSHARE OPPORTUNITY", OXSHARE_AFFILIATE_URL)],
    [Markup.button.callback("🏠 HOME", "home_now")]
  ]));
}

async function showStatus(ctx) {
  const result = await dbRequest({ action: "get_user", telegram_user_id: ctx.from.id });
  const user = result.user;
  if (!user) return showHome(ctx);
  const premium = user.premium ? "⭐ PREMIUM ACTIVE" : "⛏️ FREE ACCOUNT";
  return ctx.reply(`${premium}\n\n📊 Activity: ${user.dig_count || 0}\n🔥 Streak: ${user.streak_count || 0}\n👥 Referrals: ${user.referral_count || 0}\n\n${user.premium ? "⭐ +2 activity points per daily dig." : "⭐ Premium adds +2 activity points per daily dig."}\n\n💰 Want to explore OxShare? Use the button below.`, Markup.inlineKeyboard([
    [Markup.button.callback("⛏️ DIG NOW", "dig_now")],
    ...(user.premium ? [] : [[Markup.button.callback("⭐ GET PREMIUM", "premium_info")]]),
    [Markup.button.url("💰 VISIT OXSHARE", OXSHARE_AFFILIATE_URL)],
    [Markup.button.callback("📤 INVITE", "invite_friends"), Markup.button.callback("🏠 HOME", "home_now")]
  ]));
}

async function showAffiliate(ctx) {
  return ctx.reply("💰 OXSHARE\n\nThis is separate from the StoneDigger game. Review the service, terms and risks before signing up. No earnings are guaranteed.\n\n⚠️ Third-party affiliate link.", Markup.inlineKeyboard([
    [Markup.button.url("💰 VISIT OXSHARE", OXSHARE_AFFILIATE_URL)],
    [Markup.button.callback("💼 FXPRO", "fxpro_info")],
    [Markup.button.callback("🏠 BACK TO GAME", "home_now")]
  ]));
}

async function showFxPro(ctx) {
  return ctx.reply("💼 FXPRO PARTNER OFFER\n\nOpen an FxPro account through our partner link.\n\n⚠️ StoneDigger may receive compensation if you register through this referral link. This is not investment advice. CFDs are complex instruments and carry a high risk of losing money rapidly due to leverage. Availability depends on your country and applicable regulations.", Markup.inlineKeyboard([
    [Markup.button.url("💼 JOIN FXPRO", FXPRO_AFFILIATE_URL)],
    [Markup.button.callback("⛏️ BACK TO GAME", "home_now")]
  ]));
}

bot.start(async (ctx) => {
  await syncUser(ctx);
  const payload = ctx.startPayload || "";
  if (payload.startsWith("ref_")) {
    try { await dbRequest({ action: "apply_referral", telegram_user_id: ctx.from.id, first_name: ctx.from.first_name || "", username: ctx.from.username || "", referral_code: payload.slice(4) }); }
    catch (error) { console.error("Referral application failed:", error); }
  }
  return showHome(ctx, true);
});

bot.command("dig", performDig);
bot.command("referral", showReferral);
bot.command("leaderboard", showLeaderboard);
bot.command("status", showStatus);
bot.command("premium", showPremium);
bot.command("affiliate", showAffiliate);
bot.command("fxpro", showFxPro);
bot.command("community", (ctx) => ctx.reply("👥 STONEDIGGER COMMUNITY", Markup.inlineKeyboard([[Markup.button.url("👥 JOIN COMMUNITY", COMMUNITY_URL)], [Markup.button.callback("💼 FXPRO", "fxpro_info")], [Markup.button.callback("🏠 HOME", "home_now")]])));
bot.help((ctx) => ctx.reply("⛏️ StoneDigger\n\nUse the buttons to play.\n\n/dig — Daily dig\n/referral — Invite friends\n/premium — Premium (100 Stars)\n/leaderboard — Leaderboard\n/status — My stats\n/affiliate — OxShare\n/fxpro — FxPro partner offer\n/community — Community\n/terms — Terms\n/paysupport — Payment support", mainKeyboard()));

bot.action("home_now", async (ctx) => { await ctx.answerCbQuery(); return showHome(ctx); });
bot.action("dig_now", async (ctx) => { await ctx.answerCbQuery("⛏️ Digging..."); return performDig(ctx); });
bot.action("invite_friends", async (ctx) => { await ctx.answerCbQuery(); return showReferral(ctx); });
bot.action("leaderboard_now", async (ctx) => { await ctx.answerCbQuery(); return showLeaderboard(ctx); });
bot.action("premium_info", async (ctx) => { await ctx.answerCbQuery(); return showPremium(ctx); });
bot.action("fxpro_info", async (ctx) => { await ctx.answerCbQuery(); return showFxPro(ctx); });
bot.action("buy_premium", async (ctx) => {
  await ctx.answerCbQuery();
  await syncUser(ctx);
  return ctx.replyWithInvoice({ title: "StoneDigger Premium", description: "Unlock StoneDigger Premium for 100 Telegram Stars.", payload: "stonedigger-premium-v1", currency: "XTR", prices: [{ label: "Premium", amount: PREMIUM_STARS }] });
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
  if (result.duplicate) return ctx.reply("ℹ️ Payment already recorded.\n⭐ Premium remains active.", mainKeyboard());
  return ctx.reply("✅ PAYMENT RECEIVED!\n⭐ 100 Stars confirmed.\n🚀 Premium unlocked.", mainKeyboard());
});

bot.command("terms", (ctx) => ctx.reply("📜 StoneDigger Terms\n\nStoneDigger is an activity and referral bot. Activity points and leaderboard positions are not cash and do not guarantee earnings. Premium is a paid digital feature for 100 Telegram Stars. Affiliate links are third-party links and commissions depend on the affiliate program's terms. FxPro is a separate partner offer; availability depends on jurisdiction and CFDs carry a high risk of losing money. Use the bot responsibly and do not spam referrals."));
bot.command("paysupport", (ctx) => ctx.reply("For payment support, contact the bot owner."));

async function facebookDb(action, body) { return dbRequest({ action, ...body }); }
async function sendFacebookMessage(recipientId, message) {
  if (!FACEBOOK_PAGE_ACCESS_TOKEN) throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN is not configured");
  const response = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(FACEBOOK_PAGE_ACCESS_TOKEN)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: { id: recipientId }, message }) });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error?.message || `Facebook send failed (${response.status})`);
  return result;
}
function fbButton(title, url) { return { type: "web_url", title, url, webview_height_ratio: "full" }; }
function fbButtons(buttons) { return { attachment: { type: "template", payload: { template_type: "button", text: "Choose an option:", buttons } } }; }
async function handleFacebookText(senderId, text) {
  const lower = String(text || "").trim().toLowerCase();
  const existing = await facebookDb("facebook_get", { facebook_user_id: senderId });
  const firstName = existing.user?.first_name || "Digger";
  if (["hi","hello","start","/start","menu","help","/help"].includes(lower)) {
    await facebookDb("facebook_upsert", { facebook_user_id: senderId, first_name: firstName });
    return sendFacebookMessage(senderId, { text: `⛏️ WELCOME TO STONEDIGGER, ${firstName}!\n\nDig daily, build your streak and climb the leaderboard.`, quick_replies: [
      { content_type: "text", title: "⛏️ DIG NOW", payload: "DIG" },
      { content_type: "text", title: "🏆 LEADERBOARD", payload: "LEADERBOARD" },
      { content_type: "text", title: "💰 OXSHARE", payload: "OXSHARE" }
    ] });
  }
  if (["dig","/dig","⛏️ dig now"].includes(lower)) {
    const result = await facebookDb("facebook_dig", { facebook_user_id: senderId, first_name: firstName });
    const dig = result.dig || {};
    if (!dig.did_dig) return sendFacebookMessage(senderId, { text: `⏳ YOU ALREADY DUG TODAY!\n\n📊 Activity: ${dig.dig_count || 0}\n🔥 Streak: ${dig.streak_count || 0}\n\nCome back tomorrow.` });
    const ox = dig.dig_count % 3 === 0 ? "\n\n💰 Explore the separate OxShare opportunity below.\n⚠️ Third-party affiliate link; no earnings are guaranteed." : "";
    return sendFacebookMessage(senderId, { text: `⛏️ DIG COMPLETE!\n\n📊 Activity: ${dig.dig_count || 0}\n🔥 Streak: ${dig.streak_count || 0}${dig.premium ? "\n⭐ Premium bonus active." : ""}${ox}`, quick_replies: [
      { content_type: "text", title: "⛏️ DIG", payload: "DIG" },
      { content_type: "text", title: "🏆 RANK", payload: "LEADERBOARD" },
      { content_type: "text", title: "💰 OXSHARE", payload: "OXSHARE" }
    ] });
  }
  if (["leaderboard","/leaderboard","rank","/rank"].includes(lower)) {
    const result = await facebookDb("facebook_leaderboard", {});
    const rows = result.leaderboard || [];
    const text = rows.length ? rows.map((u, i) => `${i + 1}. ${u.first_name || "Player"} — ⛏️${u.dig_count || 0} • 🔥${u.streak_count || 0}`).join("\n") : "No players yet. Be the first to dig!";
    return sendFacebookMessage(senderId, { text: `🏆 TOP DIGGERS\n\n${text}` });
  }
  if (["oxshare","/affiliate","affiliate","money","opportunity"].includes(lower)) {
    return sendFacebookMessage(senderId, { text: "💰 OXSHARE OPPORTUNITY\n\nThis is separate from StoneDigger. Review the service, terms and risks before signing up. No earnings are guaranteed.\n\n⚠️ StoneDigger may receive affiliate compensation if you register through this referral link.", ...fbButtons([fbButton("💰 VISIT OXSHARE", OXSHARE_AFFILIATE_URL)]) });
  }
  if (["community","/community"].includes(lower)) return sendFacebookMessage(senderId, { text: "👥 Join the StoneDigger community:", ...fbButtons([fbButton("👥 JOIN COMMUNITY", COMMUNITY_URL)]) });
  return sendFacebookMessage(senderId, { text: "⛏️ I can help you DIG, show the LEADERBOARD, or show the OXSHARE opportunity. Type DIG to start.", quick_replies: [
    { content_type: "text", title: "⛏️ DIG", payload: "DIG" },
    { content_type: "text", title: "🏆 RANK", payload: "LEADERBOARD" },
    { content_type: "text", title: "💰 OXSHARE", payload: "OXSHARE" }
  ] });
}
function verifyFacebookSignature(rawBody, signature) {
  if (!FACEBOOK_APP_SECRET) return true;
  const expected = "sha256=" + crypto.createHmac("sha256", FACEBOOK_APP_SECRET).update(rawBody).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || "")); } catch { return false; }
}
async function handleFacebookWebhook(req, res) {
  if (req.method === "GET") {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === FACEBOOK_VERIFY_TOKEN && FACEBOOK_VERIFY_TOKEN) { res.writeHead(200, { "content-type": "text/plain" }); res.end(url.searchParams.get("hub.challenge")); return; }
    res.writeHead(403); res.end("Forbidden"); return;
  }
  if (req.method !== "POST") { res.writeHead(405); res.end("Method Not Allowed"); return; }
  let rawBody = "";
  req.on("data", chunk => rawBody += chunk);
  req.on("end", async () => {
    try {
      if (!verifyFacebookSignature(rawBody, req.headers["x-hub-signature-256"])) { res.writeHead(403); res.end("Invalid signature"); return; }
      const body = JSON.parse(rawBody);
      if (body.object !== "page") { res.writeHead(404); res.end("Not found"); return; }
      for (const entry of body.entry || []) for (const event of entry.messaging || []) {
        if (!event.sender?.id || event.sender.id === event.recipient?.id) continue;
        if (event.message?.quick_reply?.payload) await handleFacebookText(event.sender.id, event.message.quick_reply.payload);
        else if (event.message?.text) await handleFacebookText(event.sender.id, event.message.text);
      }
      res.writeHead(200); res.end("EVENT_RECEIVED");
    } catch (error) { console.error("Facebook webhook error:", error); res.writeHead(500); res.end("ERROR"); }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") { res.writeHead(200, { "content-type": "text/plain" }); res.end("StoneDigger is running"); return; }
  if (req.url === "/facebook/webhook") return handleFacebookWebhook(req, res);
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
    { command: "start", description: "Open the game" },
    { command: "dig", description: "Daily dig" },
    { command: "referral", description: "Invite friends" },
    { command: "premium", description: "Premium — 100 Stars" },
    { command: "leaderboard", description: "Leaderboard" },
    { command: "status", description: "My stats" },
    { command: "affiliate", description: "OxShare affiliate" },
    { command: "fxpro", description: "FxPro partner offer" },
    { command: "community", description: "Join community" },
    { command: "help", description: "Help" },
    { command: "terms", description: "Terms" },
    { command: "paysupport", description: "Payment support" }
  ]);
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) { await bot.telegram.setWebhook(`${webhookUrl.replace(/\/$/, "")}/telegram/webhook`); console.log("Telegram webhook set"); }
  if (FACEBOOK_VERIFY_TOKEN && FACEBOOK_PAGE_ACCESS_TOKEN) console.log("Facebook Messenger integration configured");
  else console.log("Facebook Messenger integration awaiting Meta credentials");
});
