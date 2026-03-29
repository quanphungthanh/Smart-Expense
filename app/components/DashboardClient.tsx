"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Car,
  CircleDot,
  Coffee,
  Loader2,
  Music,
  Send,
  ShoppingBag,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import {
  endOfMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
} from "date-fns";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { Transaction } from "@/lib/types/transaction";

const CATEGORIES_ORDER = [
  "Food",
  "Transport",
  "Utilities",
  "Shopping",
  "Entertainment",
  "Other",
] as const;

function categoryIcon(category: string) {
  switch (category) {
    case "Food":
      return UtensilsCrossed;
    case "Transport":
      return Car;
    case "Utilities":
      return Zap;
    case "Shopping":
      return ShoppingBag;
    case "Entertainment":
      return Music;
    default:
      return CircleDot;
  }
}

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatWhen(iso: string) {
  try {
    const d = parseISO(iso);
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

export function DashboardClient() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [rawText, setRawText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions", { cache: "no-store" });
      const data = (await res.json()) as {
        transactions?: Transaction[];
        error?: string;
      };
      if (!res.ok) {
        setLoadError(data.error ?? "Could not load transactions.");
        setTransactions(data.transactions ?? []);
        return;
      }
      setLoadError(null);
      setTransactions(data.transactions ?? []);
    } catch {
      setLoadError("Network error while loading transactions.");
      setTransactions([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      const id = window.setInterval(() => void loadTransactions(), 15_000);
      return () => window.clearInterval(id);
    }
    const channel = supabase
      .channel("transactions-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions" },
        () => void loadTransactions(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadTransactions]);

  const monthRange = useMemo(() => {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, []);

  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      try {
        const d = parseISO(t.created_at);
        return isWithinInterval(d, monthRange);
      } catch {
        return false;
      }
    });
  }, [transactions, monthRange]);

  const monthTotal = useMemo(
    () => monthTransactions.reduce((s, t) => s + t.amount, 0),
    [monthTransactions],
  );

  const categoryShares = useMemo(() => {
    const totals = new Map<string, number>();
    for (const c of CATEGORIES_ORDER) totals.set(c, 0);
    for (const t of monthTransactions) {
      totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
    }
    const denom = monthTotal > 0 ? monthTotal : 1;
    return CATEGORIES_ORDER.map((name) => ({
      name,
      amount: totals.get(name) ?? 0,
      pct: Math.round(((totals.get(name) ?? 0) / denom) * 1000) / 10,
    }));
  }, [monthTransactions, monthTotal]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const text = rawText.trim();
    if (!text) {
      setFormError("Enter a message like “coffee 20k”.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: text }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormError(data.error ?? "Could not save.");
        return;
      }
      setRawText("");
      await loadTransactions();
    } catch {
      setFormError("Network error while saving.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">Smart Slack Expense</p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              Dashboard
            </h1>
            <p className="mt-1 max-w-xl text-sm text-zinc-500">
              Mock Slack input for testing; live data from Supabase. Slack messages hit the webhook
              API once configured.
            </p>
          </div>
        </header>

        {(loadError || formError) && (
          <div
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            {loadError && <p>{loadError}</p>}
            {formError && <p className={loadError ? "mt-2" : ""}>{formError}</p>}
          </div>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Total this month</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900">
              {loadingList ? "…" : formatVnd(monthTotal)}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Transactions this month</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900">
              {loadingList ? "…" : monthTransactions.length}
            </p>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Category mix (this month)</h2>
          <ul className="mt-4 space-y-4">
            {categoryShares.map(({ name, amount, pct }) => {
              const Icon = categoryIcon(name);
              return (
                <li key={name}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium text-zinc-700">
                      <Icon className="size-4 text-zinc-400" aria-hidden />
                      {name}
                    </span>
                    <span className="tabular-nums text-zinc-500">
                      {formatVnd(amount)} · {monthTotal > 0 ? `${pct}%` : "—"}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-[width] duration-500"
                      style={{ width: `${monthTotal > 0 ? pct : 0}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mb-8 rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Transaction history</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Newest first · updates live when possible</p>
          </div>
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-zinc-500">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading…
            </div>
          ) : transactions.length === 0 ? (
            <p className="px-5 py-16 text-center text-sm text-zinc-500">
              No transactions yet. Add one below or send a Slack message to your webhook.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {transactions.map((t) => {
                const Icon = categoryIcon(t.category);
                return (
                  <li
                    key={t.id}
                    className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">{t.description}</p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500" title={t.raw_text}>
                          {t.raw_text}
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">{formatWhen(t.created_at)}</p>
                      </div>
                    </div>
                    <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-900 sm:text-base">
                      {formatVnd(t.amount)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Coffee className="size-5 text-violet-600" aria-hidden />
            <h2 className="text-sm font-semibold text-zinc-900">Mock Slack message</h2>
          </div>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="slack-text">
              Slack-style expense text
            </label>
            <input
              id="slack-text"
              type="text"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder='e.g. "grab to office 45k" or "coffee 20k"'
              className="min-h-11 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none ring-violet-500/20 placeholder:text-zinc-400 focus:border-violet-400 focus:bg-white focus:ring-4"
              disabled={submitting}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              Save
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
