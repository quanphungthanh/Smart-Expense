export type ExpenseCategory =
  | "Food"
  | "Transport"
  | "Utilities"
  | "Shopping"
  | "Entertainment"
  | "Other";

export type ParseSuccess = {
  amount: number;
  description: string;
  category: ExpenseCategory;
};

export type ParseExpenseResult =
  | { ok: true; data: ParseSuccess }
  | { ok: false; error: string };

const CATEGORY_KEYWORDS: Record<Exclude<ExpenseCategory, "Other">, readonly string[]> = {
  Food: [
    "food",
    "coffee",
    "cafe",
    "café",
    "lunch",
    "dinner",
    "breakfast",
    "snack",
    "restaurant",
    "meal",
    "ăn",
    "cơm",
    "pho",
    "phở",
    "bun",
    "bún",
    "trasua",
    "tra sua",
    "trà sữa",
    "nhau",
    "nhậu",
    "banh",
    "bánh",
  ],
  Transport: [
    "transport",
    "taxi",
    "grab",
    "uber",
    "bus",
    "train",
    "metro",
    "subway",
    "parking",
    "fuel",
    "gas",
    "xe",
    "om",
    "ôm",
    "ve xe",
    "vé xe",
    "xang",
    "xăng",
    "flight",
    "may bay",
    "máy bay",
  ],
  Utilities: [
    "utilities",
    "utility",
    "electric",
    "electricity",
    "water",
    "internet",
    "wifi",
    "phone",
    "bill",
    "dien",
    "điện",
    "nuoc",
    "nước",
    "gas bill",
  ],
  Shopping: [
    "shopping",
    "shop",
    "store",
    "market",
    "grocery",
    "clothes",
    "mua",
    "siêu thị",
    "sieu thi",
    "amazon",
    "shopee",
    "lazada",
  ],
  Entertainment: [
    "entertainment",
    "movie",
    "cinema",
    "game",
    "netflix",
    "spotify",
    "concert",
    "show",
    "fun",
    "xem phim",
    "karaoke",
  ],
};

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function tokenize(text: string): string[] {
  return normalizeForMatch(text)
    .split(/[^a-z0-9]+/u)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function categorizeFromText(text: string): ExpenseCategory {
  const normalizedPhrase = normalizeForMatch(text).replace(/\s+/g, " ");
  const tokensArr = tokenize(text);
  const tokenSet = new Set(tokensArr);
  const entries = Object.entries(CATEGORY_KEYWORDS) as [
    Exclude<ExpenseCategory, "Other">,
    readonly string[],
  ][];
  for (const [category, words] of entries) {
    for (const w of words) {
      const nw = normalizeForMatch(w);
      if (nw.includes(" ")) {
        if (normalizedPhrase.includes(nw.replace(/\s+/g, " "))) {
          return category;
        }
      } else if (tokenSet.has(nw)) {
        return category;
      }
    }
  }
  return "Other";
}

function parseNumericToken(raw: string): number {
  const t = raw.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    return parseInt(t.replace(/\./g, ""), 10);
  }
  if (/^\d{1,3}(,\d{3})+$/.test(t)) {
    return parseInt(t.replace(/,/g, ""), 10);
  }
  const normalized = t.replace(/,/g, ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : NaN;
}

type AmountMatch = {
  index: number;
  length: number;
  amount: number;
};

function collectAmountMatches(input: string): AmountMatch[] {
  const s = input;
  const out: AmountMatch[] = [];

  const add = (m: RegExpExecArray, mult: (n: number) => number) => {
    const rawNum = m[1];
    const num = parseNumericToken(rawNum);
    if (!Number.isFinite(num)) return;
    const amount = mult(num);
    if (!Number.isFinite(amount) || amount <= 0) return;
    out.push({ index: m.index, length: m[0].length, amount });
  };

  const patterns: Array<{ re: RegExp; mult: (n: number) => number }> = [
    { re: /(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|trieu)\b/gi, mult: (n) => n * 1_000_000 },
    { re: /(\d+(?:[.,]\d+)?)\s*(?:k|n|nghin|nghìn)\b/gi, mult: (n) => n * 1_000 },
    { re: /(\d+(?:[.,]\d+)?)\s*(?:m)\b/gi, mult: (n) => n * 1_000_000 },
    {
      re: /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:đ|vnd)\b/gi,
      mult: (n) => n,
    },
  ];

  for (const { re, mult } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      add(m, mult);
    }
  }

  const plainRe = /\b(\d{4,})\b/g;
  let pm: RegExpExecArray | null;
  while ((pm = plainRe.exec(s)) !== null) {
    const num = parseInt(pm[1], 10);
    if (Number.isFinite(num) && num > 0) {
      out.push({ index: pm.index, length: pm[0].length, amount: num });
    }
  }

  return out;
}

function pickAmountMatch(matches: AmountMatch[]): AmountMatch | null {
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.index - b.index || b.amount - a.amount);
  return matches[0];
}

export function parseExpense(raw: string): ParseExpenseResult {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) {
    return { ok: false, error: "Message is empty." };
  }

  const matches = collectAmountMatches(text);
  const picked = pickAmountMatch(matches);
  if (!picked) {
    return { ok: false, error: "Could not find an amount (e.g. 20k, 3tr, 50000)." };
  }

  const before = text.slice(0, picked.index).trim();
  const after = text.slice(picked.index + picked.length).trim();
  const description = `${before} ${after}`.replace(/\s+/g, " ").trim() || "Expense";

  return {
    ok: true,
    data: {
      amount: Math.round(picked.amount),
      description,
      category: categorizeFromText(description),
    },
  };
}
