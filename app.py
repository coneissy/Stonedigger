import os
import sqlite3
import threading
from flask import Flask
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, PreCheckoutQueryHandler, ContextTypes

TOKEN = os.environ.get("BOT_TOKEN")
DB = os.environ.get("DB_PATH", "stonedigger.db")
app = Flask(__name__)
lock = threading.Lock()


def db():
    conn = sqlite3.connect(DB)
    conn.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, stones INTEGER NOT NULL DEFAULT 0, energy INTEGER NOT NULL DEFAULT 10, max_energy INTEGER NOT NULL DEFAULT 10, referrals INTEGER NOT NULL DEFAULT 0)")
    conn.execute("CREATE TABLE IF NOT EXISTS payments (telegram_payment_charge_id TEXT PRIMARY KEY, user_id INTEGER, product TEXT, stars INTEGER)")
    conn.commit()
    return conn


def get_user(uid, username=""):
    conn = db()
    conn.execute("INSERT OR IGNORE INTO users(id, username) VALUES (?, ?)", (uid, username or ""))
    conn.execute("UPDATE users SET username=? WHERE id=?", (username or "", uid))
    conn.commit()
    row = conn.execute("SELECT id, username, stones, energy, max_energy, referrals FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    return row


def update_user(uid, **fields):
    conn = db()
    cols = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE users SET {cols} WHERE id=?", (*fields.values(), uid))
    conn.commit(); conn.close()


def menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("⛏️ DIG", callback_data="dig"), InlineKeyboardButton("⚡ ENERGY", callback_data="energy")],
        [InlineKeyboardButton("🚀 BOOSTS", callback_data="boosts"), InlineKeyboardButton("👥 REFERRALS", callback_data="ref")],
        [InlineKeyboardButton("🏆 LEADERBOARD", callback_data="leaders"), InlineKeyboardButton("💎 PREMIUM", callback_data="premium")],
    ])


def home_text(row):
    _, username, stones, energy, max_energy, referrals = row
    return (f"⛏️ *StoneDigger*\n\nWelcome, {username or 'Digger'}!\n\n"
            f"🪨 Stones: *{stones:,}*\n⚡ Energy: *{energy}/{max_energy}*\n👥 Referrals: *{referrals}*\n\n"
            "Dig stones, upgrade your operation, and unlock premium features with Telegram Stars ⭐.")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    row = get_user(uid, update.effective_user.username)
    await update.message.reply_text(home_text(row), parse_mode="Markdown", reply_markup=menu())

async def buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    uid = q.from_user.id
    row = get_user(uid, q.from_user.username)
    _, _, stones, energy, max_energy, referrals = row
    if q.data == "dig":
        if energy <= 0:
            await q.message.reply_text("⚡ No energy left. Use Energy or buy a boost with Stars ⭐.", reply_markup=menu()); return
        gained = 10
        update_user(uid, stones=stones+gained, energy=energy-1)
        row = get_user(uid, q.from_user.username)
        await q.message.edit_text(home_text(row) + f"\n\n🎉 You dug *+{gained} stones*!", parse_mode="Markdown", reply_markup=menu())
    elif q.data == "energy":
        update_user(uid, energy=max_energy)
        await q.message.edit_text(home_text(get_user(uid, q.from_user.username)) + "\n\n⚡ Energy refilled for free.", parse_mode="Markdown", reply_markup=menu())
    elif q.data == "boosts":
        await q.message.edit_text("🚀 *Boost Shop*\n\n⚡ +50 Energy — 25 Stars\n🔥 2× digging — 50 Stars\n💎 +1,000 Stones — 75 Stars\n\nChoose a premium boost:", parse_mode="Markdown", reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("⚡ +50 Energy — ⭐25", callback_data="buy_energy")],
            [InlineKeyboardButton("🔥 2× Digging — ⭐50", callback_data="buy_multiplier")],
            [InlineKeyboardButton("💎 +1,000 Stones — ⭐75", callback_data="buy_stones")],
            [InlineKeyboardButton("⬅️ Back", callback_data="back")]
        ]))
    elif q.data == "premium":
        await q.message.edit_text("💎 *StoneDigger Premium*\n\nUnlock premium boosts and convenience features using Telegram Stars ⭐.", parse_mode="Markdown", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⭐ Buy 100 Stars Pack", callback_data="buy_stones")],[InlineKeyboardButton("⬅️ Back", callback_data="back")]]))
    elif q.data == "ref":
        me = await context.bot.get_me()
        link = f"https://t.me/{me.username}?start=ref_{uid}"
        await q.message.edit_text(f"👥 *Invite & Grow*\n\nShare your link:\n`{link}`\n\nReferral rewards are in-game stones, not cash or Stars.", parse_mode="Markdown", reply_markup=menu())
    elif q.data == "leaders":
        conn=db(); rows=conn.execute("SELECT username, stones FROM users ORDER BY stones DESC LIMIT 10").fetchall(); conn.close()
        text="🏆 *Top Diggers*\n\n" + "\n".join(f"{i+1}. {u or 'Digger'} — {s:,} 🪨" for i,(u,s) in enumerate(rows))
        await q.message.edit_text(text, parse_mode="Markdown", reply_markup=menu())
    elif q.data == "back":
        await q.message.edit_text(home_text(get_user(uid, q.from_user.username)), parse_mode="Markdown", reply_markup=menu())
    elif q.data.startswith("buy_"):
        products={"buy_energy":("energy_50",25,"+50 Energy"),"buy_multiplier":("multiplier_2x",50,"2× Digging"),"buy_stones":("stones_1000",75,"+1,000 Stones")}
        product, stars, label=products[q.data]
        await context.bot.send_invoice(chat_id=uid,title=f"StoneDigger {label}",description=f"Digital StoneDigger feature: {label}",payload=product,currency="XTR",prices=[{"label":label,"amount":stars}])

async def precheckout(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.pre_checkout_query.answer(ok=True)

async def payment(update: Update, context: ContextTypes.DEFAULT_TYPE):
    p=update.message.successful_payment; uid=update.effective_user.id
    conn=db(); conn.execute("INSERT OR IGNORE INTO payments VALUES (?,?,?,?)",(p.telegram_payment_charge_id,uid,p.invoice_payload,p.total_amount)); conn.commit(); conn.close()
    if p.invoice_payload == "energy_50":
        row=get_user(uid); update_user(uid,energy=row[4]+50,max_energy=row[4]+50)
    elif p.invoice_payload == "stones_1000":
        row=get_user(uid); update_user(uid,stones=row[2]+1000)
    elif p.invoice_payload == "multiplier_2x":
        context.application.bot_data.setdefault("multipliers",set()).add(uid)
    await update.message.reply_text("✅ Payment confirmed! Your StoneDigger premium feature is active. ⭐", reply_markup=menu())

@app.get("/")
def health(): return "StoneDigger is online", 200

async def run_bot():
    if not TOKEN: raise RuntimeError("BOT_TOKEN is not set")
    application=Application.builder().token(TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(buttons))
    application.add_handler(PreCheckoutQueryHandler(precheckout))
    application.add_handler(__import__('telegram').ext.MessageHandler(__import__('telegram').ext.filters.SUCCESSFUL_PAYMENT, payment))
    await application.initialize(); await application.start(); await application.updater.start_polling()
    import asyncio; await asyncio.Event().wait()

if __name__ == "__main__":
    db()
    import asyncio
    threading.Thread(target=lambda: asyncio.run(run_bot()), daemon=True).start()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))
