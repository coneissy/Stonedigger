# StoneDigger

Telegram referral/community bot with a Render-compatible web health endpoint.

## Environment

- `BOT_TOKEN` — Telegram bot token (required)
- `OXSHARE_URL` — registration destination (defaults to the configured OxShare referral URL)
- `COMMUNITY_URL` — community destination (defaults to Imperial Elite Goldskull)
- `PORT` — HTTP port supplied by the hosting platform
- `DATA_FILE` — JSON persistence path; defaults to `./data/users.json`

## Run

```bash
npm install
npm start
```

The web service responds with JSON at `/health` and `/`. Referral data is loaded from and atomically written to `DATA_FILE`.

**Persistence note:** Render-style ephemeral filesystems can lose data after a restart/redeploy. For durable referral history, point `DATA_FILE` at durable storage or replace the file adapter with an external database.

WhiteStones is a separate project and is not modified by StoneDigger.
