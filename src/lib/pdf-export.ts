import type { TaxResult, DpsIncomeRow, IbkrData } from "./types";

function fmtDate(d: string) {
  if (d.length === 8) return `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}`;
  return d;
}

function fmtNum(n: number, decimals = 2) {
  return n.toLocaleString("uk-UA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function exportToPdf(result: TaxResult, dpsRows: DpsIncomeRow[], ibkrData: IbkrData | null, year: number) {
  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    h2 { font-size: 14px; margin: 18px 0 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
    h3 { font-size: 12px; margin: 12px 0 6px; color: #444; }
    .subtitle { color: #666; font-size: 11px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
    th { background: #f0f0f0; font-weight: 600; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .pos { color: #16a34a; }
    .neg { color: #dc2626; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .summary-box { border: 1px solid #ddd; border-radius: 4px; padding: 8px; }
    .summary-box .label { font-size: 9px; color: #666; }
    .summary-box .value { font-size: 14px; font-weight: 700; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ccc; color: #888; font-size: 9px; }
    @media print { body { padding: 12px; } }
    @page { size: A4 landscape; margin: 10mm; }
  `;

  let html = `<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"><title>DeclarUA — Розрахунок ${year}</title><style>${styles}</style></head><body>`;

  html += `<h1>Розрахунок податків за ${year} рік</h1>`;
  html += `<p class="subtitle">Згенеровано: ${new Date().toLocaleDateString("uk-UA")} · DeclarUA</p>`;

  // Summary
  html += `<h2>Підсумок</h2>`;
  html += `<div class="summary-grid">`;
  html += `<div class="summary-box"><div class="label">Загальний дохід</div><div class="value">${fmtNum(result.totalIncome)} ₴</div></div>`;
  html += `<div class="summary-box"><div class="label">ПДФО + ВЗ сплачено агентом</div><div class="value">${fmtNum(round2(result.agentPaidPdfo + result.agentPaidVz))} ₴</div></div>`;
  html += `<div class="summary-box"><div class="label">ПДФО до сплати самостійно</div><div class="value">${fmtNum(result.pdfoToPay)} ₴</div></div>`;
  html += `<div class="summary-box"><div class="label">ВЗ до сплати самостійно</div><div class="value">${fmtNum(result.vzToPay)} ₴</div></div>`;
  if (result.foreignTaxCredit > 0) {
    html += `<div class="summary-box"><div class="label">Залік іноземного податку (п.18)</div><div class="value pos">-${fmtNum(result.foreignTaxCredit)} ₴</div></div>`;
  }
  html += `</div>`;

  // Tax categories
  html += `<h2>Категорії доходів</h2>`;
  html += `<table><thead><tr><th>Рядок</th><th>Назва</th><th>Дохід, ₴</th><th>ПДФО, ₴</th><th>ВЗ, ₴</th><th>Сплата</th></tr></thead><tbody>`;
  for (const cat of result.categories) {
    html += `<tr>
      <td>${cat.category}</td>
      <td>${cat.label}</td>
      <td class="num">${fmtNum(cat.amount)}</td>
      <td class="num">${fmtNum(cat.pdfo)}</td>
      <td class="num">${fmtNum(cat.vz)}</td>
      <td>${cat.agentPaid ? "агент" : "самостійно"}</td>
    </tr>`;
  }
  html += `</tbody></table>`;

  // Trades
  if (result.lots.length > 0) {
    html += `<h2>Операції з цінними паперами (FIFO)</h2>`;

    // Trade summary
    html += `<div class="summary-grid">`;
    html += `<div class="summary-box"><div class="label">Дохід від продажу</div><div class="value">${fmtNum(result.totalProceedsUah)} ₴</div></div>`;
    html += `<div class="summary-box"><div class="label">Собівартість</div><div class="value">${fmtNum(result.totalCostUah)} ₴</div></div>`;
    html += `<div class="summary-box"><div class="label">Фінансовий результат</div><div class="value ${result.investmentPnl >= 0 ? "pos" : "neg"}">${fmtNum(result.investmentPnl)} ₴</div></div>`;
    html += `<div class="summary-box"><div class="label">Курсова різниця</div><div class="value">${fmtNum(result.exchangeRateDiff)} ₴</div></div>`;
    html += `</div>`;

    html += `<table><thead><tr>
      <th>Тікер</th><th>К-ть</th>
      <th>Дата покупки</th><th>Курс НБУ</th>
      <th>Дата продажу</th><th>Курс НБУ</th>
      <th>Витрати, $</th><th>Дохід, $</th>
      <th>Витрати, ₴</th><th>Дохід, ₴</th>
      <th>P&L, ₴</th>
    </tr></thead><tbody>`;

    for (const lot of result.lots) {
      const cls = lot.pnlUah >= 0 ? "pos" : "neg";
      html += `<tr>
        <td>${lot.symbol}</td>
        <td class="num">${lot.quantity}</td>
        <td>${fmtDate(lot.buyDate)}</td>
        <td class="num">${lot.buyRate.toFixed(4)}</td>
        <td>${fmtDate(lot.sellDate)}</td>
        <td class="num">${lot.sellRate.toFixed(4)}</td>
        <td class="num">${fmtNum(lot.costUsd)}</td>
        <td class="num">${fmtNum(lot.proceedsUsd)}</td>
        <td class="num">${fmtNum(lot.costUah)}</td>
        <td class="num">${fmtNum(lot.proceedsUah)}</td>
        <td class="num ${cls}">${fmtNum(lot.pnlUah)}</td>
      </tr>`;
    }

    html += `</tbody></table>`;

    if (result.totalCommissionUsd > 0) {
      html += `<p>Комісія брокера: $${fmtNum(result.totalCommissionUsd)}</p>`;
    }
  }

  // Dividends
  if (result.dividends.length > 0) {
    html += `<h2>Дивіденди</h2>`;

    html += `<div class="summary-grid">`;
    html += `<div class="summary-box"><div class="label">Загальна сума дивідендів</div><div class="value">${fmtNum(result.totalDividendsUah)} ₴</div></div>`;
    html += `<div class="summary-box"><div class="label">Утримано за кордоном</div><div class="value">${fmtNum(result.totalWithholdingUah)} ₴</div></div>`;
    html += `</div>`;

    html += `<table><thead><tr>
      <th>Тікер</th><th>Дата</th>
      <th>Сума, $</th><th>Утримано, $</th>
      <th>Курс НБУ</th>
      <th>Сума, ₴</th><th>Утримано, ₴</th>
    </tr></thead><tbody>`;

    for (const div of result.dividends) {
      html += `<tr>
        <td>${div.symbol}</td>
        <td>${fmtDate(div.date)}</td>
        <td class="num">${fmtNum(div.amount)}</td>
        <td class="num">${fmtNum(div.withholdingTax)}</td>
        <td class="num">${div.rate.toFixed(4)}</td>
        <td class="num">${fmtNum(div.amountUah)}</td>
        <td class="num">${fmtNum(div.withholdingTaxUah)}</td>
      </tr>`;
    }

    html += `</tbody></table>`;
  }

  // DPS rows
  if (dpsRows.length > 0) {
    html += `<h2>Доходи з ДПС (F1419104)</h2>`;
    html += `<table><thead><tr>
      <th>Джерело</th><th>Дохід, ₴</th><th>ПДФО, ₴</th><th>ВЗ, ₴</th><th>Код</th>
    </tr></thead><tbody>`;

    for (const row of dpsRows) {
      html += `<tr>
        <td>${row.description || row.agentCode}</td>
        <td class="num">${fmtNum(row.amount)}</td>
        <td class="num">${fmtNum(row.taxPaid)}</td>
        <td class="num">${fmtNum(row.militaryLevyPaid)}</td>
        <td>${row.incomeCode}</td>
      </tr>`;
    }

    html += `</tbody></table>`;
  }

  // Footer
  html += `<div class="footer">
    <p>Документ згенеровано автоматично сервісом DeclarUA · ${new Date().toISOString()}</p>
    <p>Курси НБУ отримано з офіційного API Національного банку України (bank.gov.ua)</p>
    <p>Розрахунок виконано відповідно до Податкового кодексу України: ст. 167 (ставки), ст. 170.2 (інвестприбуток), ст. 170.11 (іноземні доходи)</p>
  </div>`;

  html += `</body></html>`;

  // Open in new window for print-to-PDF
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // Fallback: download as HTML
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `declarua_${year}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
}
