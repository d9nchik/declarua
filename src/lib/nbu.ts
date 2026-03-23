const cache = new Map<string, number>();

const FALLBACK_RATES: Record<string, number> = {
  USD: 41.5,
  EUR: 45,
};

export async function getNbuRate(
  currency: string,
  date: string
): Promise<number> {
  if (currency === "UAH") return 1;

  const key = `${currency}:${date}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const cleanDate = date.replace(/\D/g, "");
    const res = await fetch(
      `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${encodeURIComponent(currency)}&date=${cleanDate}&json`
    );
    const data = await res.json();
    const rate = data[0]?.rate;
    if (typeof rate === "number" && rate > 0) {
      cache.set(key, rate);
      return rate;
    }
  } catch {
    // fall through to fallback
  }

  const fallback = FALLBACK_RATES[currency] ?? 41.5;
  cache.set(key, fallback);
  return fallback;
}

export async function getNbuRatesBatch(
  requests: { currency: string; date: string }[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  const unique = requests.filter((r) => {
    const key = `${r.currency}:${r.date}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      results.set(key, cached);
      return false;
    }
    return true;
  });

  // Batch in groups of 5
  for (let i = 0; i < unique.length; i += 5) {
    const batch = unique.slice(i, i + 5);
    const rates = await Promise.all(
      batch.map((r) => getNbuRate(r.currency, r.date))
    );
    batch.forEach((r, idx) => {
      results.set(`${r.currency}:${r.date}`, rates[idx]);
    });
  }

  return results;
}

export function clearNbuCache() {
  cache.clear();
}
