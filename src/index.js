import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Telegraf, Markup } from 'telegraf';

const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const bot = new Telegraf(token);
const users = new Map();
const OXSHARE_URL = process.env.OXSHARE_URL || 'https://my.oxshare.com/register?referral=019ba1ff-6ca2-70b3-9def-036b59457426';
const COMMUNITY_URL = process.env.COMMUNITY_URL || 'https://t.me/ImperialEliteGoldskull';
const PORT = Number(process.env.PORT || 10000);
const DATA_FILE = process.env.DATA_FILE || './data/users.json';

const text = {
  en: { welcome: '🔥 Welcome to StoneDigger!\n\nBuild your network, complete the available actions, and track your referrals.', register: '🚀 Register / Start', community: '👥 Join Community', stats: '📊 My Referrals', share: '🔗 Share Referral', statsText: (n) => `📊 Your direct referrals: ${n}`, shareText: (link) => `Invite friends with your StoneDigger link:\n${link}` },
  ar: { welcome: '🔥 أهلاً بك في StoneDigger!\n\nابنِ شبكتك، نفّذ الإجراءات المتاحة، وتابع إحالاتك.', register: '🚀 التسجيل / البدء', community: '👥 انضم للمجتمع', stats: '📊 إحالاتي', share: '🔗 مشاركة رابط الإحالة', statsText: (n) => `📊 عدد إحالاتك المباشرة: ${n}`, shareText: (link) => `ادعُ أصدقاءك عبر رابط StoneDigger الخاص بك:\n${link}` },
  fr: { welcome: '🔥 Bienvenue sur StoneDigger !\n\nDéveloppez votre réseau, effectuez les actions disponibles et suivez vos parrainages.', register: '🚀 S’inscrire / Commencer', community: '👥 Rejoindre la communauté', stats: '📊 Mes parrainages', share: '🔗 Partager le parrainage', statsText: (n) => `📊 Vos parrainages directs : ${n}`, shareText: (link) => `Invitez vos amis avec votre lien StoneDigger :\n${link}` }
};

function getLang(ctx) {
  const code = (ctx.from?.language_code || 'en').toLowerCase();
  if (code.startsWith('ar')) return 'ar';
  if (code.startsWith('fr')) return 'fr';
  return 'en';
}

function ensureUser(ctx) {
  const id = String(ctx.from.id);
  if (!users.has(id)) users.set(id, { id, referrals: new Set(), referredBy: null });
  return users.get(id);
}

function serializeUsers() {
  return [...users.values()].map((u) => ({ id: u.id, referrals: [...u.referrals], referredBy: u.referredBy }));
}

async function saveUsers() {
  const file = path.resolve(DATA_FILE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(serializeUsers(), null, 2), 'utf8');
  await fs.rename(temp, file);
}

async function loadUsers() {
  try {
    const raw = await fs.readFile(path.resolve(DATA_FILE), 'utf8');
    const saved = JSON.parse(raw);
    for (const item of Array.isArray(saved) ? saved : []) {
      users.set(String(item.id), { id: String(item.id), referrals: new Set((item.referrals || []).map(String)), referredBy: item.referredBy ? String(item.referredBy) : null });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load referral data:', error);
  }
}

function referralLink(ctx) {
  const username = ctx.botInfo?.username;
  return username ? `https://t.me/${username}?start=ref_${ctx.from.id}` : `ref_${ctx.from.id}`;
}

bot.start(async (ctx) => {
  const user = ensureUser(ctx);
  const payload = ctx.startPayload || '';
  if (payload.startsWith('ref_')) {
    const referrerId = payload.slice(4);
    if (referrerId && referrerId !== user.id && !user.referredBy) {
      const referrer = users.get(referrerId) || { id: referrerId, referrals: new Set(), referredBy: null };
      users.set(referrerId, referrer);
      user.referredBy = referrerId;
      referrer.referrals.add(user.id);
      await saveUsers();
    }
  }
  const t = text[getLang(ctx)];
  await ctx.reply(t.welcome, Markup.inlineKeyboard([
    [Markup.button.url(t.register, OXSHARE_URL)],
    [Markup.button.url(t.community, COMMUNITY_URL)],
    [Markup.button.callback(t.stats, 'stats'), Markup.button.callback(t.share, 'share')]
  ]));
});

bot.action('stats', async (ctx) => {
  const user = ensureUser(ctx);
  const t = text[getLang(ctx)];
  await ctx.answerCbQuery();
  await ctx.reply(t.statsText(user.referrals.size));
});

bot.action('share', async (ctx) => {
  const t = text[getLang(ctx)];
  await ctx.answerCbQuery();
  await ctx.reply(t.shareText(referralLink(ctx)));
});

bot.catch((err) => console.error('StoneDigger bot error:', err));

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'stonedigger' }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
});

await loadUsers();
server.listen(PORT, '0.0.0.0', () => console.log(`StoneDigger health server listening on ${PORT}`));
await bot.launch();
console.log('StoneDigger bot started');

process.once('SIGINT', () => { server.close(); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { server.close(); bot.stop('SIGTERM'); });
