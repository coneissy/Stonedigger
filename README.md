# ⛏️ StoneDigger

StoneDigger is a Telegram digging game built around virtual stones, energy, referrals, leaderboards, and optional premium digital features purchased with Telegram Stars.

## Features

- ⛏️ Dig for virtual stones
- ⚡ Energy system
- 🚀 Premium boosts
- 👥 Referral links
- 🏆 Leaderboard
- ⭐ Telegram Stars payments for digital features
- 🌐 Render-ready Web Service with a health endpoint

## Render setup

Use the included `render.yaml`, or create a Free Web Service from this repository.

Required environment variable:

- `BOT_TOKEN` — the Telegram bot token, stored only in Render environment variables

Build command: `pip install -r requirements.txt`

Start command: `gunicorn app:app --bind 0.0.0.0:$PORT`

The Free Render tier is intended for testing/hobby use and may spin down after inactivity. Persistent player data should eventually move from local SQLite to a persistent database.

## Telegram Stars

Stars are used only for digital StoneDigger features. The bot confirms a purchase through Telegram's successful-payment update before granting the purchased feature.
