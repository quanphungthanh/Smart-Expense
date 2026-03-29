# Smart-Expense

Personal expense tracker: Slack messages → Supabase → Next.js dashboard.

## Setup

1. Copy [`.env.example`](.env.example) to `.env.local` and fill in Supabase and optional Slack variables.
2. In the Supabase SQL editor, run [`supabase/schema.sql`](supabase/schema.sql). If adding the table to `supabase_realtime` fails because it is already published, skip that line.
3. `npm install` then `npm run dev`.

## Slack Events API

- Request URL: `https://<your-domain>/api/slack/webhook`
- Subscribe to `message.channels` or `message.groups` (and reinstall the app after changing scopes).
- Optional: set `SLACK_EXPENSE_CHANNEL_ID` to restrict processing to one channel.
- Optional: `SLACK_BOT_TOKEN` with `chat:write` for thread confirmations.
