import { Telegraf } from "telegraf";
import http from "node:http";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required");

const bot = new Telegraf(token);
const port = Number(process.env.PORT || 10000);
const PREMIUM_STARS = 50;

bot.start((ctx) => ctx.reply("⛏️ Welcome to StoneDigger!\n\nUse /help to see what you can do."));

bot.help((ctx) => ctx.reply("⛏️ StoneDigger\n\n/start — Start\n/help — Help\n/premium — Premium"));

bot.command("premium", async (ctx) => {
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
  await ctx.reply("✅ Payment received!\n⭐ StoneDigger Premium is unlocked for you.\n\nThank you for supporting StoneDigger!");
  console.log(`Premium payment: user=${ctx.from.id} stars=${payment.total_amount} charge=${payment.telegram_payment_charge_id}`);
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
      try {
        await bot.handleUpdate(JSON.parse(body));
        res.writeHead(200);
        res.end("OK");
      } catch (error) {
        console.error(error);
        res.writeHead(500);
        res.end("ERROR");
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(port, async () => {
  console.log(`HTTP server listening on ${port}`);
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) {
    await bot.telegram.setWebhook(`${webhookUrl.replace(/\/$/, "")}/telegram/webhook`);
    console.log("Webhook set");
  } else {
    console.log("WEBHOOK_URL not set yet");
  }
});
