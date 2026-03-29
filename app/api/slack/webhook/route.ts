import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { parseExpense } from "@/utils/parseExpense";

export const runtime = "nodejs";

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifySlackRequest(
  signingSecret: string,
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): boolean {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 60 * 5) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(base, "utf8").digest("hex");
  const expected = `v0=${hmac}`;
  return timingSafeEqual(signature, expected);
}

type SlackUrlVerification = { type: "url_verification"; challenge: string };
type SlackEventCallback = {
  type: "event_callback";
  event?: {
    type?: string;
    subtype?: string;
    bot_id?: string;
    text?: string;
    channel?: string;
    user?: string;
    ts?: string;
    thread_ts?: string;
  };
};

async function postSlackThreadReply(
  token: string,
  channel: string,
  threadTs: string,
  text: string,
): Promise<void> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text,
    }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string };
  if (!json.ok) {
    console.error("Slack chat.postMessage failed:", json.error);
  }
}

export async function POST(request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const rawBody = await request.text();

  if (!signingSecret) {
    return NextResponse.json({ error: "SLACK_SIGNING_SECRET is not set." }, { status: 503 });
  }

  const sig = request.headers.get("x-slack-signature");
  const ts = request.headers.get("x-slack-request-timestamp");
  if (!verifySlackRequest(signingSecret, rawBody, ts, sig)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: SlackUrlVerification | SlackEventCallback | { type?: string };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (payload.type === "url_verification" && "challenge" in payload) {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type !== "event_callback" || !("event" in payload)) {
    return NextResponse.json({ ok: true });
  }

  const ev = payload.event;
  if (!ev || ev.type !== "message") {
    return NextResponse.json({ ok: true });
  }

  if (ev.subtype) {
    return NextResponse.json({ ok: true });
  }

  if (ev.bot_id) {
    return NextResponse.json({ ok: true });
  }

  const channelFilter = process.env.SLACK_EXPENSE_CHANNEL_ID;
  if (channelFilter && ev.channel && ev.channel !== channelFilter) {
    return NextResponse.json({ ok: true });
  }

  const text = typeof ev.text === "string" ? ev.text.trim() : "";
  if (!text) {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseExpense(text);
  if (!parsed.ok) {
    console.warn("Slack message parse failed:", parsed.error, text);
    return NextResponse.json({ ok: true });
  }

  if (!isSupabaseConfigured()) {
    console.error("Supabase not configured; cannot save Slack expense.");
    return NextResponse.json({ ok: true });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("transactions").insert({
      amount: parsed.data.amount,
      description: parsed.data.description,
      category: parsed.data.category,
      raw_text: text,
    });
    if (error) {
      console.error(error);
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: true });
  }

  const botToken = process.env.SLACK_BOT_TOKEN;
  if (botToken && ev.channel && ev.ts) {
    const threadTs = ev.thread_ts || ev.ts;
    const reply = `✅ Saved: ${parsed.data.description} - ${parsed.data.amount.toLocaleString("vi-VN")} VND`;
    await postSlackThreadReply(botToken, ev.channel, threadTs, reply);
  }

  return NextResponse.json({ ok: true });
}
