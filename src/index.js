import { Telegraf, Markup } from 'telegraf';

const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const bot = new Telegraf(token);
const users = new Map();

const OXSHARE_URL = process.env.OXSHARE_URL || 'https://my.oxshare.com/register?referral=019ba1ff-6ca2-70b3-9def-036b59457426';
const COMMUNITY_URL = process.env.COMMUNITY_URL || 'https://t.me/ImperialEliteGoldskull';

const text = {
  en: {
    welcome: '🔥 Welcome to StoneDigger!\n\nBuild your network, complete the available actions, and track your referrals.',
    register: '🚀 Register / Start',
    community: '👥 Join Community',
    stats: '📊 My Referrals',
    share: '🔗 Share Referral',
    statsText: (count) => `📊 Your direct referrals: ${count}`,
    shareText: (link) => `Invite friends with your StoneDigger link:\n${link}`
  },
  ar: {
    welcome: '🔥 أهلاً بك في StoneDigger!\n\nابنِ شبكتك، نفّذ الإجراءات المتاحة، وتابع إحالاتك.',
    register: '🚀 التسجيل / البدء',
    community: '👥 انضم للمجتمع',
    stats: '📊 إحالاتي',
    share: '🔗 مشاركة رابط الإحالة',
    statsText: (count) => `📊 عدد إحالاتك المباشرة: ${count}`,
    shareText: (link) => `ادعُ أصدقاءك عبر رابط StoneDigger الخاص بك:\n${link}`
  },
  fr: {
    welcome: '🔥 Bienvenue sur StoneDigger !\n\nDéveloppez votre réseau, effectuez les actions disponibles et suivez vos parrainages.',
    register: '🚀 S’inscrire / Commencer',
    community: '👥 Rejoindre la communauté',
    stats: '📊 Mes parrainages',
    share: '🔗 Partager le parrainage',
    statsText: (count) => `📊 Vos parrainages directs : ${count}`,
    shareText: (link) => `Invitez vos amis avec votre lien StoneDigger :\n${link}`
  }
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
      const referrer = users.get(referrerId);
      if (referrer) {
        user.referredBy = referrerId;
        referrer.referrals.add(user.id);
      }
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

bot.launch().then(() => console.log('StoneDigger bot started'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
