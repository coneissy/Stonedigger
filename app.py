import os
import sqlite3
import threading
from flask import Flask
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, LabeledPrice
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, PreCheckoutQueryHandler, ContextTypes, MessageHandler, filters

TOKEN = os.environ.get("BOT_TOKEN")
DB = os.environ.get("DB_PATH", "stonedigger.db")
app = Flask(__name__)
lock = threading.Lock()

LANGS = {"en": "🇬🇧 English", "ar": "🇱🇧 العربية", "fr": "🇫🇷 Français", "es": "🇪🇸 Español", "de": "🇩🇪 Deutsch", "tr": "🇹🇷 Türkçe", "fa": "🇦🇫 فارسی", "ru": "🇷🇺 Русский"}
T = {
 "en": {"welcome":"Welcome", "dig":"⛏️ DIG", "energy":"⚡ ENERGY", "boosts":"🚀 BOOSTS", "ref":"👥 REFERRALS", "leaders":"🏆 LEADERBOARD", "premium":"💎 PREMIUM", "stones":"🪨 Stones", "referrals":"👥 Referrals", "intro":"Dig stones, upgrade your operation, and unlock premium features with Telegram Stars ⭐.", "noenergy":"⚡ No energy left. Use Energy or buy a boost with Stars ⭐.", "refilled":"⚡ Energy refilled for free.", "dug":"🎉 You dug +{gained} stones!", "language":"🌍 Language", "language_set":"✅ Language changed to {name}.", "back":"⬅️ Back", "shop":"🚀 Boost Shop", "choose":"Choose a premium boost:", "energy50":"⚡ +50 Energy — ⭐25", "multi":"🔥 2× Digging — ⭐50", "stones1000":"💎 +1,000 Stones — ⭐75", "premium_text":"💎 StoneDigger Premium\n\nUnlock premium boosts and convenience features using Telegram Stars ⭐.", "invite":"👥 Invite & Grow", "share":"Share your link", "ref_note":"Referral rewards are in-game stones, not cash or Stars.", "top":"🏆 Top Diggers", "payment":"✅ Payment confirmed! Your StoneDigger premium feature is active. ⭐", "terms":"StoneDigger provides virtual in-game features. Purchases are made with Telegram Stars. Virtual stones are not cash and are not a promise of monetary earnings.", "support":"For payment support, contact the bot owner through the support channel provided by the bot owner."},
 "ar": {"welcome":"أهلاً بك", "dig":"⛏️ حفر", "energy":"⚡ الطاقة", "boosts":"🚀 التعزيزات", "ref":"👥 الإحالات", "leaders":"🏆 المتصدرون", "premium":"💎 بريميوم", "stones":"🪨 الأحجار", "referrals":"👥 الإحالات", "intro":"احفر الأحجار وطوّر عملياتك وافتح الميزات المدفوعة باستخدام Telegram Stars ⭐.", "noenergy":"⚡ انتهت الطاقة. استخدم الطاقة أو اشترِ تعزيزاً بالنجوم ⭐.", "refilled":"⚡ تمت إعادة تعبئة الطاقة مجاناً.", "dug":"🎉 حصلت على +{gained} حجر!", "language":"🌍 اللغة", "language_set":"✅ تم تغيير اللغة إلى {name}.", "back":"⬅️ رجوع", "shop":"🚀 متجر التعزيزات", "choose":"اختر تعزيزاً مدفوعاً:", "energy50":"⚡ +50 طاقة — ⭐25", "multi":"🔥 حفر ×2 — ⭐50", "stones1000":"💎 +1,000 حجر — ⭐75", "premium_text":"💎 StoneDigger Premium\n\nافتح التعزيزات والميزات باستخدام Telegram Stars ⭐.", "invite":"👥 ادعُ واربح", "share":"شارك رابطك", "ref_note":"مكافآت الإحالة هي أحجار داخل اللعبة وليست نقوداً أو Stars.", "top":"🏆 أفضل الحفّارين", "payment":"✅ تم تأكيد الدفع! ميزة StoneDigger الخاصة بك مفعّلة. ⭐", "terms":"يوفر StoneDigger ميزات افتراضية داخل اللعبة. تتم عمليات الشراء باستخدام Telegram Stars. الأحجار الافتراضية ليست نقوداً ولا تمثل وعداً بأرباح مالية.", "support":"لدعم المدفوعات، تواصل مع مالك البوت عبر قناة الدعم التي يوفرها مالك البوت."},
 "fr": {"welcome":"Bienvenue", "dig":"⛏️ CREUSER", "energy":"⚡ ÉNERGIE", "boosts":"🚀 BOOSTS", "ref":"👥 PARRAINAGES", "leaders":"🏆 CLASSEMENT", "premium":"💎 PREMIUM", "stones":"🪨 Pierres", "referrals":"👥 Parrainages", "intro":"Creusez, améliorez votre opération et débloquez des fonctionnalités avec Telegram Stars ⭐.", "noenergy":"⚡ Plus d’énergie. Rechargez ou achetez un boost avec des Stars ⭐.", "refilled":"⚡ Énergie rechargée gratuitement.", "dug":"🎉 Vous avez creusé +{gained} pierres !", "language":"🌍 Langue", "language_set":"✅ Langue changée en {name}.", "back":"⬅️ Retour", "shop":"🚀 Boutique des boosts", "choose":"Choisissez un boost premium :", "energy50":"⚡ +50 Énergie — ⭐25", "multi":"🔥 Creusage ×2 — ⭐50", "stones1000":"💎 +1 000 Pierres — ⭐75", "premium_text":"💎 StoneDigger Premium\n\nDébloquez des boosts avec Telegram Stars ⭐.", "invite":"👥 Inviter & progresser", "share":"Partagez votre lien", "ref_note":"Les récompenses de parrainage sont des pierres virtuelles, pas de l’argent ni des Stars.", "top":"🏆 Meilleurs creuseurs", "payment":"✅ Paiement confirmé ! Votre fonctionnalité premium est active. ⭐", "terms":"StoneDigger fournit des fonctionnalités virtuelles. Les achats utilisent Telegram Stars. Les pierres virtuelles ne sont pas de l’argent et ne garantissent aucun gain financier.", "support":"Pour l’assistance paiement, contactez le propriétaire du bot via le canal d’assistance fourni."}
}
for lang in ("es", "de", "tr", "fa", "ru"):
    T[lang] = T["en"]


def db():
    conn = sqlite3.connect(DB)
    conn.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, language TEXT NOT NULL DEFAULT 'en', stones INTEGER NOT NULL DEFAULT 0, energy INTEGER NOT NULL DEFAULT 10, max_energy INTEGER NOT NULL DEFAULT 10, referrals INTEGER NOT NULL DEFAULT 0)")
    # Upgrade older databases safely.
    try: conn.execute("ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'en'")
    except sqlite3.OperationalError: pass
    conn.execute("CREATE TABLE IF NOT EXISTS payments (telegram_payment_charge_id TEXT PRIMARY KEY, user_id INTEGER, product TEXT, stars INTEGER)")
    conn.commit()
    return conn


def get_user(uid, username="", language=None):
    conn = db()
    conn.execute("INSERT OR IGNORE INTO users(id, username, language) VALUES (?, ?, ?)", (uid, username or "", language or "en"))
    conn.execute("UPDATE users SET username=? WHERE id=?", (username or "", uid))
    if language:
        conn.execute("UPDATE users SET language=? WHERE id=?", (language, uid))
    conn.commit()
    row = conn.execute("SELECT id, username, language, stones, energy, max_energy, referrals FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    return row


def update_user(uid, **fields):
    conn = db(); cols = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE users SET {cols} WHERE id=?", (*fields.values(), uid)); conn.commit(); conn.close()


def lang_for(row): return row[2] if row and row[2] in T else "en"
def tr(row, key, **kwargs): return T[lang_for(row)].get(key, T["en"].get(key, key)).format(**kwargs)


def menu(row):
    return InlineKeyboardMarkup([[InlineKeyboardButton(tr(row,"dig"), callback_data="dig"), InlineKeyboardButton(tr(row,"energy"), callback_data="energy")], [InlineKeyboardButton(tr(row,"boosts"), callback_data="boosts"), InlineKeyboardButton(tr(row,"ref"), callback_data="ref")], [InlineKeyboardButton(tr(row,"leaders"), callback_data="leaders"), InlineKeyboardButton(tr(row,"premium"), callback_data="premium")], [InlineKeyboardButton(tr(row,"language"), callback_data="language")]])


def home_text(row):
    _, username, _, stones, energy, max_energy, referrals = row
    return f"⛏️ *StoneDigger*\n\n{tr(row,'welcome')}, {username or 'Digger'}!\n\n{tr(row,'stones')}: *{stones:,}*\n⚡ Energy: *{energy}/{max_energy}*\n{tr(row,'referrals')}: *{referrals}*\n\n{tr(row,'intro')}"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    u = update.effective_user
    detected = (u.language_code or "en").split("-")[0].lower()
    if detected not in T: detected = "en"
    row = get_user(u.id, u.username, detected)
    # Referral processing: /start ref_<user_id>
    if context.args and context.args[0].startswith("ref_"):
        try:
            referrer = int(context.args[0][4:])
            if referrer != u.id:
                conn=db(); changed=conn.execute("UPDATE users SET referrals=referrals+1 WHERE id=?",(referrer,)).rowcount; conn.commit(); conn.close()
                if changed: update_user(referrer, stones=get_user(referrer)[3] + 100)
        except (ValueError, TypeError): pass
    await update.message.reply_text(home_text(row), parse_mode="Markdown", reply_markup=menu(row))

async def buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q=update.callback_query; await q.answer(); uid=q.from_user.id; row=get_user(uid,q.from_user.username); _,_,_,stones,energy,max_energy,referrals=row
    if q.data == "language":
        kb=[[InlineKeyboardButton(name, callback_data=f"lang:{code}")] for code,name in LANGS.items()]
        kb.append([InlineKeyboardButton(tr(row,"back"), callback_data="back")]); await q.message.edit_text(tr(row,"language"), reply_markup=InlineKeyboardMarkup(kb)); return
    if q.data.startswith("lang:"):
        code=q.data.split(":",1)[1]; update_user(uid,language=code); row=get_user(uid,q.from_user.username); await q.message.edit_text(home_text(row)+"\n\n"+tr(row,"language_set",name=LANGS[code]),parse_mode="Markdown",reply_markup=menu(row)); return
    if q.data == "dig":
        if energy<=0: await q.message.reply_text(tr(row,"noenergy"),reply_markup=menu(row)); return
        gained=10; update_user(uid,stones=stones+gained,energy=energy-1); row=get_user(uid,q.from_user.username); await q.message.edit_text(home_text(row)+"\n\n"+tr(row,"dug",gained=gained),parse_mode="Markdown",reply_markup=menu(row))
    elif q.data == "energy":
        update_user(uid,energy=max_energy); row=get_user(uid,q.from_user.username); await q.message.edit_text(home_text(row)+"\n\n"+tr(row,"refilled"),parse_mode="Markdown",reply_markup=menu(row))
    elif q.data == "boosts":
        await q.message.edit_text(f"🚀 *{tr(row,'shop')}*\n\n⚡ +50 Energy — 25 Stars\n🔥 2× digging — 50 Stars\n💎 +1,000 Stones — 75 Stars\n\n{tr(row,'choose')}",parse_mode="Markdown",reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton(tr(row,"energy50"),callback_data="buy_energy")],[InlineKeyboardButton(tr(row,"multi"),callback_data="buy_multiplier")],[InlineKeyboardButton(tr(row,"stones1000"),callback_data="buy_stones")],[InlineKeyboardButton(tr(row,"back"),callback_data="back")]]))
    elif q.data == "premium":
        await q.message.edit_text(tr(row,"premium_text"),parse_mode="Markdown",reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⭐ +1,000 Stones — 75",callback_data="buy_stones")],[InlineKeyboardButton(tr(row,"back"),callback_data="back")]]))
    elif q.data == "ref":
        me=await context.bot.get_me(); link=f"https://t.me/{me.username}?start=ref_{uid}"; await q.message.edit_text(f"{tr(row,'invite')}\n\n{tr(row,'share')}:\n`{link}`\n\n{tr(row,'ref_note')}",parse_mode="Markdown",reply_markup=menu(row))
    elif q.data == "leaders":
        conn=db(); rows=conn.execute("SELECT username,stones FROM users ORDER BY stones DESC LIMIT 10").fetchall(); conn.close(); text=f"{tr(row,'top')}\n\n"+"\n".join(f"{i+1}. {u or 'Digger'} — {s:,} 🪨" for i,(u,s) in enumerate(rows)); await q.message.edit_text(text,parse_mode="Markdown",reply_markup=menu(row))
    elif q.data == "back":
        await q.message.edit_text(home_text(row),parse_mode="Markdown",reply_markup=menu(row))
    elif q.data.startswith("buy_"):
        products={"buy_energy":("energy_50",25,"+50 Energy"),"buy_multiplier":("multiplier_2x",50,"2× Digging"),"buy_stones":("stones_1000",75,"+1,000 Stones")}; product,stars,label=products[q.data]
        await context.bot.send_invoice(chat_id=uid,title=f"StoneDigger {label}",description=f"Digital StoneDigger feature: {label}",payload=product,currency="XTR",prices=[LabeledPrice(label,stars)])

async def precheckout(update: Update, context: ContextTypes.DEFAULT_TYPE): await update.pre_checkout_query.answer(ok=True)

async def payment(update: Update, context: ContextTypes.DEFAULT_TYPE):
    p=update.message.successful_payment; uid=update.effective_user.id; conn=db(); conn.execute("INSERT OR IGNORE INTO payments VALUES (?,?,?,?)",(p.telegram_payment_charge_id,uid,p.invoice_payload,p.total_amount)); conn.commit(); conn.close(); row=get_user(uid)
    if p.invoice_payload=="energy_50": update_user(uid,energy=row[5]+50,max_energy=row[5]+50)
    elif p.invoice_payload=="stones_1000": update_user(uid,stones=row[3]+1000)
    elif p.invoice_payload=="multiplier_2x": context.application.bot_data.setdefault("multipliers",set()).add(uid)
    await update.message.reply_text(tr(row,"payment"),reply_markup=menu(get_user(uid)))

async def terms(update: Update, context: ContextTypes.DEFAULT_TYPE): await update.message.reply_text(tr(get_user(update.effective_user.id),"terms"))
async def paysupport(update: Update, context: ContextTypes.DEFAULT_TYPE): await update.message.reply_text(tr(get_user(update.effective_user.id),"support"))

@app.get("/")
def health(): return "StoneDigger is online",200

async def run_bot():
    if not TOKEN: raise RuntimeError("BOT_TOKEN is not set")
    application=Application.builder().token(TOKEN).build(); application.add_handler(CommandHandler("start",start)); application.add_handler(CommandHandler("terms",terms)); application.add_handler(CommandHandler("paysupport",paysupport)); application.add_handler(CallbackQueryHandler(buttons)); application.add_handler(PreCheckoutQueryHandler(precheckout)); application.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT,payment)); await application.initialize(); await application.start(); await application.updater.start_polling(); import asyncio; await asyncio.Event().wait()

if __name__=="__main__":
    db(); import asyncio; threading.Thread(target=lambda: asyncio.run(run_bot()),daemon=True).start(); app.run(host="0.0.0.0",port=int(os.environ.get("PORT",10000)))
