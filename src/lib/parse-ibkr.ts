import type { IbkrData, ClosedLot, Dividend } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseDate(raw: string): string {
  // IBKR format: "YYYYMMDD;HHMMSS" or "YYYYMMDD"
  return raw.split(";")[0].slice(0, 8);
}

export function parseIbkrXml(xmlText: string): IbkrData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Невірний формат XML файлу IBKR");
  }

  const statement = doc.querySelector("FlexStatement");
  const accountId = statement?.getAttribute("accountId") ?? "";
  const fromDate = statement?.getAttribute("fromDate") ?? "";
  const toDate = statement?.getAttribute("toDate") ?? "";

  // Parse closed lots
  const lots: ClosedLot[] = [];
  const lotElements = doc.querySelectorAll("Lot");
  for (const el of lotElements) {
    if (el.getAttribute("levelOfDetail") !== "CLOSED_LOT") continue;

    const cost = parseFloat(el.getAttribute("cost") ?? "0");
    const fifoPnl = parseFloat(el.getAttribute("fifoPnlRealized") ?? "0");
    const costUsd = round2(cost);
    const proceedsUsd = round2(cost + fifoPnl);

    lots.push({
      symbol: el.getAttribute("symbol") ?? "",
      description: el.getAttribute("description") ?? "",
      currency: el.getAttribute("currency") || "USD",
      quantity: Math.abs(parseFloat(el.getAttribute("quantity") ?? "0")),
      buyDate: parseDate(el.getAttribute("openDateTime") ?? ""),
      sellDate: parseDate(el.getAttribute("tradeDate") ?? ""),
      costUsd,
      proceedsUsd,
      pnlUsd: round2(proceedsUsd - costUsd),
    });
  }

  // Parse commissions from sell trades
  let totalCommission = 0;
  const trades = doc.querySelectorAll("Trade");
  for (const el of trades) {
    if (
      el.getAttribute("levelOfDetail") === "EXECUTION" &&
      el.getAttribute("buySell") === "SELL" &&
      parseFloat(el.getAttribute("fifoPnlRealized") ?? "0") !== 0
    ) {
      totalCommission += Math.abs(
        parseFloat(el.getAttribute("ibCommission") ?? "0")
      );
    }
  }

  // Parse dividends and withholding tax
  const dividendMap = new Map<
    string,
    { symbol: string; currency: string; date: string; amount: number; actionId: string }
  >();
  const withholdingMap = new Map<string, number>();

  const cashTxns = doc.querySelectorAll("CashTransaction");
  for (const el of cashTxns) {
    if (el.getAttribute("levelOfDetail") !== "DETAIL") continue;

    const type = el.getAttribute("type") ?? "";
    const symbol = el.getAttribute("symbol") ?? "";
    const actionId = el.getAttribute("actionID") ?? "";
    const amount = parseFloat(el.getAttribute("amount") ?? "0");
    const currency = el.getAttribute("currency") || "USD";
    const dateTime = el.getAttribute("dateTime") ?? "";
    const key = `${symbol}-${actionId}`;

    if (type === "Dividends" && amount > 0) {
      dividendMap.set(key, {
        symbol,
        currency,
        date: parseDate(dateTime),
        amount: round2(amount),
        actionId,
      });
    } else if (type === "Withholding Tax") {
      withholdingMap.set(key, round2(Math.abs(amount)));
    }
  }

  const dividends: Dividend[] = [];
  for (const [key, div] of dividendMap) {
    dividends.push({
      ...div,
      withholdingTax: withholdingMap.get(key) ?? 0,
    });
  }

  return { accountId, fromDate, toDate, lots, dividends, totalCommission };
}
