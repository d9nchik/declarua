import * as XLSX from "xlsx";
import type { LotWithRates, DividendWithRates, TaxResult } from "./types";

function fmtDate(d: string) {
  if (d.length === 8) return `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}`;
  return d;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function exportToExcel(result: TaxResult, year: number) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Closed Lots (trades)
  if (result.lots.length > 0) {
    const lotsData = result.lots.map((lot) => ({
      "Тікер": lot.symbol,
      "Кількість": lot.quantity,
      "Ціна покупки, $": round2(lot.costUsd / lot.quantity),
      "Ціна продажу, $": round2(lot.proceedsUsd / lot.quantity),
      "Дата покупки": fmtDate(lot.buyDate),
      "Дата продажу": fmtDate(lot.sellDate),
      "Курс НБУ (покупка)": lot.buyRate,
      "Курс НБУ (продаж)": lot.sellRate,
      "Загальна курсова різниця": round2(lot.proceedsUah - lot.costUah - (lot.proceedsUsd - lot.costUsd) * lot.sellRate),
      "Витрати, $": round2(lot.costUsd),
      "Дохід, $": round2(lot.proceedsUsd),
      "Витрати, ₴": round2(lot.costUah),
      "Дохід, ₴": round2(lot.proceedsUah),
      "P&L, $": round2(lot.pnlUsd),
      "P&L, ₴": round2(lot.pnlUah),
      "Оригінальна ціна продажу, $": round2(lot.proceedsUsd),
      "Оригінальна валюта": lot.currency,
      "ПДФО (18%), ₴": round2(Math.max(0, lot.pnlUah) * 0.18),
      "Військовий збір (5%), ₴": round2(Math.max(0, lot.pnlUah) * 0.05),
      "Номер рахунку": lot.description || "",
    }));

    const ws = XLSX.utils.json_to_sheet(lotsData);

    // Auto-size columns
    const colWidths = Object.keys(lotsData[0]).map((key) => ({
      wch: Math.max(key.length, ...lotsData.map((r) => String((r as Record<string, unknown>)[key] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Угоди (FIFO)");

    // Summary row at the bottom
    const summaryData = [
      {
        "Показник": "Загальний дохід від продажу, ₴",
        "Значення": round2(result.totalProceedsUah),
      },
      {
        "Показник": "Загальна собівартість, ₴",
        "Значення": round2(result.totalCostUah),
      },
      {
        "Показник": "Загальний P&L, ₴",
        "Значення": round2(result.investmentPnl),
      },
      {
        "Показник": "Курсова різниця, ₴",
        "Значення": round2(result.exchangeRateDiff),
      },
      {
        "Показник": "Оподатковуваний прибуток, ₴",
        "Значення": round2(result.investmentTaxableProfit),
      },
      {
        "Показник": "Комісія брокера, $",
        "Значення": round2(result.totalCommissionUsd),
      },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary["!cols"] = [{ wch: 35 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Підсумок угод");
  }

  // Sheet 2: Dividends
  if (result.dividends.length > 0) {
    const divsData = result.dividends.map((div) => ({
      "Тікер": div.symbol,
      "Дата": fmtDate(div.date),
      "Сума дивідендів, $": round2(div.amount),
      "Утримано за кордоном, $": round2(div.withholdingTax),
      "Курс НБУ": div.rate,
      "Сума дивідендів, ₴": round2(div.amountUah),
      "Утримано за кордоном, ₴": round2(div.withholdingTaxUah),
      "ПДФО (9%), ₴": round2(div.amountUah * 0.09),
      "Військовий збір (5%), ₴": round2(div.amountUah * 0.05),
      "Валюта": div.currency,
    }));

    const ws = XLSX.utils.json_to_sheet(divsData);
    ws["!cols"] = Object.keys(divsData[0]).map((key) => ({
      wch: Math.max(key.length, ...divsData.map((r) => String((r as Record<string, unknown>)[key] ?? "").length)) + 2,
    }));

    XLSX.utils.book_append_sheet(wb, ws, "Дивіденди");

    // Dividend summary
    const divSummary = [
      { "Показник": "Загальна сума дивідендів, ₴", "Значення": round2(result.totalDividendsUah) },
      { "Показник": "Загальна сума утримана за кордоном, ₴", "Значення": round2(result.totalWithholdingUah) },
      { "Показник": "ПДФО з дивідендів (9%), ₴", "Значення": round2(result.totalDividendsUah * 0.09) },
      { "Показник": "ВЗ з дивідендів (5%), ₴", "Значення": round2(result.totalDividendsUah * 0.05) },
    ];
    const wsDivSummary = XLSX.utils.json_to_sheet(divSummary);
    wsDivSummary["!cols"] = [{ wch: 35 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsDivSummary, "Підсумок дивідендів");
  }

  // Sheet 3: Tax categories overview
  const catData = result.categories.map((cat) => ({
    "Рядок": cat.category,
    "Назва": cat.label,
    "Дохід, ₴": round2(cat.amount),
    "ПДФО, ₴": round2(cat.pdfo),
    "ВЗ, ₴": round2(cat.vz),
    "Сплата": cat.agentPaid ? "агент" : "самостійно",
  }));

  const wsCat = XLSX.utils.json_to_sheet(catData);
  wsCat["!cols"] = [{ wch: 8 }, { wch: 50 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsCat, "Категорії податків");

  // Sheet 4: Final summary
  const finalSummary = [
    { "Показник": "Загальний дохід, ₴", "Значення": round2(result.totalIncome) },
    { "Показник": "", "Значення": "" },
    { "Показник": "ПДФО сплачено агентом, ₴", "Значення": round2(result.agentPaidPdfo) },
    { "Показник": "ВЗ сплачено агентом, ₴", "Значення": round2(result.agentPaidVz) },
    { "Показник": "", "Значення": "" },
    { "Показник": "ПДФО до сплати самостійно, ₴", "Значення": round2(result.pdfoToPay) },
    { "Показник": "ВЗ до сплати самостійно, ₴", "Значення": round2(result.vzToPay) },
    { "Показник": "", "Значення": "" },
    { "Показник": "Залік іноземного податку, ₴", "Значення": round2(result.foreignTaxCredit) },
  ];
  const wsFinal = XLSX.utils.json_to_sheet(finalSummary);
  wsFinal["!cols"] = [{ wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsFinal, "Підсумок");

  // Generate and download
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `declarua_${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
