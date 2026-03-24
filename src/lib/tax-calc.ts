import type {
  DeclarationInfo,
  IbkrData,
  DpsIncomeRow,
  TaxCategory,
  TaxResult,
  LotWithRates,
  DividendWithRates,
} from "./types";
import { getNbuRate } from "./nbu";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface TaxRateInfo {
  pdfo: number;
  vz: number;
  agentPaid: boolean;
}

const TAX_RATES: Record<string, TaxRateInfo> = {
  "10.1": { pdfo: 0.18, vz: 0.05, agentPaid: true },
  "10.2": { pdfo: 0.18, vz: 0.05, agentPaid: true },
  "10.3": { pdfo: 0.05, vz: 0.05, agentPaid: true },
  "10.4": { pdfo: 0.09, vz: 0.05, agentPaid: true },
  "10.5": { pdfo: 0.05, vz: 0.05, agentPaid: true },
  "10.6": { pdfo: 0.18, vz: 0.05, agentPaid: true },
  "10.7": { pdfo: 0.18, vz: 0.05, agentPaid: true },
  "10.8": { pdfo: 0.18, vz: 0.05, agentPaid: false },
  "10.9": { pdfo: 0.18, vz: 0.05, agentPaid: true },
  "10.10": { pdfo: 0.09, vz: 0.05, agentPaid: false },
  "10.11": { pdfo: 0.18, vz: 0.05, agentPaid: false },
  "10.12": { pdfo: 0.18, vz: 0.05, agentPaid: false },
  "10.13": { pdfo: 0.18, vz: 0.05, agentPaid: true },
  "10.14": { pdfo: 0.18, vz: 0.05, agentPaid: false },
  "10.15": { pdfo: 0.18, vz: 0.05, agentPaid: false },
};

const NON_TAXABLE = new Set(["11.1", "11.2", "11.3"]);

export const CATEGORY_LABELS: Record<string, string> = {
  "10.1": "Заробітна плата",
  "10.2": "Цивільно-правові договори",
  "10.3": "Роялті",
  "10.4": "Дивіденди (українські)",
  "10.5": "Продаж майна",
  "10.6": "Оренда",
  "10.7": "Спадщина",
  "10.8": "Інвестиційний прибуток",
  "10.9": "Подарунки/призи",
  "10.10": "Іноземні доходи",
  "10.11": "Довічна рента",
  "10.12": "Страхування",
  "10.13": "Інші доходи",
  "10.14": "Доходи від КІК",
  "10.15": "Доходи від КІК (інвестиції)",
  "11.1": "Доходи ФОП",
  "11.2": "Доходи від с/г",
  "11.3": "Неоподатковувані доходи",
};

export async function calculateTax(
  info: DeclarationInfo,
  ibkrData: IbkrData | null,
  dpsRows: DpsIncomeRow[]
): Promise<TaxResult> {
  // 1. Process IBKR lots (row 10.8)
  const lots: LotWithRates[] = [];
  if (ibkrData) {
    for (const lot of ibkrData.lots) {
      const buyRate = await getNbuRate(lot.currency, lot.buyDate);
      const sellRate = await getNbuRate(lot.currency, lot.sellDate);
      const costUah = round2(lot.costUsd * buyRate);
      const proceedsUah = round2(lot.proceedsUsd * sellRate);
      lots.push({
        ...lot,
        buyRate,
        sellRate,
        costUah,
        proceedsUah,
        pnlUah: round2(proceedsUah - costUah),
      });
    }
  }

  // 2. Process IBKR dividends (row 10.10)
  const dividends: DividendWithRates[] = [];
  if (ibkrData) {
    for (const div of ibkrData.dividends) {
      const rate = await getNbuRate(div.currency, div.date);
      dividends.push({
        ...div,
        rate,
        amountUah: round2(div.amount * rate),
        withholdingTaxUah: round2(div.withholdingTax * rate),
      });
    }
  }

  // 3. Build category map
  const categoryMap = new Map<string, TaxCategory>();

  const getOrCreate = (cat: string): TaxCategory => {
    let entry = categoryMap.get(cat);
    if (!entry) {
      const rates = TAX_RATES[cat] ?? { pdfo: 0.18, vz: 0.05, agentPaid: false };
      entry = {
        category: cat,
        label: CATEGORY_LABELS[cat] ?? cat,
        amount: 0,
        pdfoRate: rates.pdfo,
        vzRate: rates.vz,
        agentPaid: rates.agentPaid,
        pdfo: 0,
        vz: 0,
      };
      categoryMap.set(cat, entry);
    }
    return entry;
  };

  // Add DPS rows
  for (const row of dpsRows) {
    if (!row.category) continue;
    const cat = getOrCreate(row.category);
    cat.amount = round2(cat.amount + row.amount);
    if (cat.agentPaid) {
      cat.pdfo = round2(cat.pdfo + row.taxPaid);
      cat.vz = round2(cat.vz + row.militaryLevyPaid);
    }
  }

  // Add IBKR investment profit (10.8)
  // Show actual P&L (can be negative) — capping at 0 only happens in F1 XML generation
  if (lots.length > 0) {
    const totalPnlUah = round2(lots.reduce((s, l) => s + l.pnlUah, 0));
    const pnlAfterLoss = round2(totalPnlUah - info.prevLoss);
    const cat = getOrCreate("10.8");
    cat.amount = round2(cat.amount + pnlAfterLoss);
    cat.pdfo = round2(pnlAfterLoss * cat.pdfoRate);
    cat.vz = round2(pnlAfterLoss * cat.vzRate);
  }

  // Add IBKR dividends (10.10)
  if (dividends.length > 0) {
    const totalDivUah = round2(
      dividends.reduce((s, d) => s + d.amountUah, 0)
    );
    const cat = getOrCreate("10.10");
    cat.amount = round2(cat.amount + totalDivUah);
    cat.source = "Дивіденди";
  }

  // 4. Calculate taxes for self-paid categories
  for (const cat of categoryMap.values()) {
    if (NON_TAXABLE.has(cat.category)) continue;
    if (!cat.agentPaid && cat.category !== "10.8") {
      cat.pdfo = round2(cat.amount * cat.pdfoRate);
      cat.vz = round2(cat.amount * cat.vzRate);
    }
  }

  // 5. Aggregate
  const categories = Array.from(categoryMap.values()).sort((a, b) =>
    a.category.localeCompare(b.category, undefined, { numeric: true })
  );

  let totalIncome = 0;
  let agentPaidPdfo = 0;
  let agentPaidVz = 0;
  let selfPaidPdfo = 0;
  let selfPaidVz = 0;

  for (const cat of categories) {
    totalIncome = round2(totalIncome + cat.amount);
    if (NON_TAXABLE.has(cat.category)) continue;
    if (cat.agentPaid) {
      agentPaidPdfo = round2(agentPaidPdfo + cat.pdfo);
      agentPaidVz = round2(agentPaidVz + cat.vz);
    } else {
      // Each self-paid category's tax is capped at 0 independently —
      // losses in 10.8 don't offset taxes from 10.10
      selfPaidPdfo = round2(selfPaidPdfo + Math.max(0, cat.pdfo));
      selfPaidVz = round2(selfPaidVz + Math.max(0, cat.vz));
    }
  }

  const totalPdfo = round2(agentPaidPdfo + selfPaidPdfo);

  // 6. Foreign tax credit
  let foreignTaxCredit = 0;
  if (info.applyForeignTaxCredit && dividends.length > 0) {
    const totalWithholdingUah = round2(
      dividends.reduce((s, d) => s + d.withholdingTaxUah, 0)
    );
    foreignTaxCredit = round2(Math.min(totalWithholdingUah, totalPdfo));
  }

  const pdfoToPay = round2(Math.max(0, selfPaidPdfo - foreignTaxCredit));
  const vzToPay = selfPaidVz;

  const investmentPnl = lots.length > 0
    ? round2(lots.reduce((s, l) => s + l.pnlUah, 0))
    : 0;

  const investmentTaxableProfit = round2(
    Math.max(0, investmentPnl - info.prevLoss)
  );

  // 7. Compute extra stats
  const totalProceedsUah = round2(lots.reduce((s, l) => s + l.proceedsUah, 0));
  const totalCostUah = round2(lots.reduce((s, l) => s + l.costUah, 0));
  const totalCommissionUsd = ibkrData?.totalCommission ?? 0;

  // Exchange rate difference
  const totalProceedsUsd = round2(lots.reduce((s, l) => s + l.proceedsUsd, 0));
  const totalPnlUsd = round2(lots.reduce((s, l) => s + l.pnlUsd, 0));
  const avgRate = totalProceedsUsd > 0 ? totalProceedsUah / totalProceedsUsd : 0;
  const expectedPnlUah = round2(totalPnlUsd * avgRate);
  const exchangeRateDiff = lots.length > 0 ? round2(investmentPnl - expectedPnlUah) : 0;

  const totalDividendsUah = round2(dividends.reduce((s, d) => s + d.amountUah, 0));
  const totalWithholdingUah = round2(dividends.reduce((s, d) => s + d.withholdingTaxUah, 0));

  return {
    categories,
    lots,
    dividends,
    totalIncome,
    agentPaidPdfo,
    agentPaidVz,
    selfPaidPdfo,
    selfPaidVz,
    totalPdfo,
    foreignTaxCredit,
    pdfoToPay,
    vzToPay,
    investmentPnl,
    investmentTaxableProfit,
    totalProceedsUah,
    totalCostUah,
    totalCommissionUsd,
    exchangeRateDiff,
    totalDividendsUah,
    totalWithholdingUah,
  };
}
