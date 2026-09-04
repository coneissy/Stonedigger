import { Telegraf } from "telegraf";
import http from "node:http";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required");

const bot = new Telegraf(token);
const port = Number(process.env.PORT || 10000);

bot.start((ctx) => ctx.reply("⛏️ Welcome to StoneDigger!\n\nUse /help to see what you can do."));

bot.help((ctx) => ctx.reply("⛏️ StoneDigger\n\n/start — Start\n/help — Help\n/premium — Premium"));

bot.command("premium", async (ctx) => {
  await ctx.reply("⭐ Premium is coming next. Telegram Stars payments will be enabled after the basic bot is online.");
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
