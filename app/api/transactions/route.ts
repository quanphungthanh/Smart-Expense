import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { Transaction } from "@/lib/types/transaction";
import { parseExpense } from "@/utils/parseExpense";

function mapRow(row: {
  id: string;
  amount: string | number;
  description: string;
  category: string;
  raw_text: string;
  created_at: string;
}): Transaction {
  return {
    id: row.id,
    amount: typeof row.amount === "number" ? row.amount : Number(row.amount),
    description: row.description,
    category: row.category,
    raw_text: row.raw_text,
    created_at: row.created_at,
  };
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured.", transactions: [] as Transaction[] },
      { status: 503 },
    );
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      transactions: (data ?? []).map(mapRow),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw =
    typeof body === "object" &&
    body !== null &&
    "raw_text" in body &&
    typeof (body as { raw_text: unknown }).raw_text === "string"
      ? (body as { raw_text: string }).raw_text
      : null;
  if (!raw) {
    return NextResponse.json({ error: "Expected { raw_text: string }." }, { status: 400 });
  }
  const parsed = parseExpense(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        amount: parsed.data.amount,
        description: parsed.data.description,
        category: parsed.data.category,
        raw_text: raw,
      })
      .select("*")
      .single();
    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ transaction: mapRow(data) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
