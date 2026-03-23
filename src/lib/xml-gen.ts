import type { DeclarationInfo, TaxResult } from "./types";

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatFillDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function categoryToTag(category: string): string {
  return "R0" + category.replace(".", "");
}

function regionFromSti(stiCode: string): { cReg: string; cRaj: string } {
  const cReg = String(parseInt(stiCode.slice(0, 2), 10));
  const cRaj = String(parseInt(stiCode.slice(2, 4), 10));
  return { cReg, cRaj };
}

const NON_TAXABLE = new Set(["11.1", "11.2", "11.3"]);

// windows-1251 encoding map for Cyrillic
const WIN1251_MAP: Record<number, number> = {};
const cyrillicChars =
  "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя";
for (let i = 0; i < cyrillicChars.length; i++) {
  WIN1251_MAP[cyrillicChars.charCodeAt(i)] = 0xc0 + i;
}
// Additional Ukrainian chars
WIN1251_MAP[0x0490] = 0xa5; // Ґ
WIN1251_MAP[0x0491] = 0xb4; // ґ
WIN1251_MAP[0x0404] = 0xaa; // Є
WIN1251_MAP[0x0454] = 0xba; // є
WIN1251_MAP[0x0406] = 0xb2; // І
WIN1251_MAP[0x0456] = 0xb3; // і
WIN1251_MAP[0x0407] = 0xaf; // Ї
WIN1251_MAP[0x0457] = 0xbf; // ї
WIN1251_MAP[0x2116] = 0xb9; // №

function toWin1251(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else {
      bytes.push(WIN1251_MAP[code] ?? 63); // ? for unknown
    }
  }
  return new Uint8Array(bytes);
}

export function generateMainXml(
  info: DeclarationInfo,
  result: TaxResult,
  uuid: string,
  hasF1: boolean
): Uint8Array {
  const { cReg, cRaj } = regionFromSti(info.stiCode);
  const fillDate = formatFillDate();
  const name = escapeXml(info.fullName);
  const city = escapeXml(info.city);
  const street = escapeXml(info.street);

  let linkedDocs = "";
  if (hasF1) {
    linkedDocs = `
    <LINKED_DOCS>
      <DOC NUM="1" TYPE="1">
        <C_DOC>F01</C_DOC>
        <C_DOC_SUB>212</C_DOC_SUB>
        <C_DOC_VER>12</C_DOC_VER>
        <C_DOC_TYPE>1</C_DOC_TYPE>
        <C_DOC_CNT>1</C_DOC_CNT>
        <C_DOC_STAN>1</C_DOC_STAN>
        <FILENAME>F0121215_DodatokF1_${uuid}.xml</FILENAME>
      </DOC>
    </LINKED_DOCS>`;
  }

  // Build body rows
  let bodyRows = "";

  // H03 only if F1 present
  if (hasF1) {
    bodyRows += `    <H03>1</H03>\n`;
  }

  // Income categories
  for (const cat of result.categories) {
    const tag = categoryToTag(cat.category);

    if (NON_TAXABLE.has(cat.category)) continue;

    if (cat.source) {
      bodyRows += `    <${tag}G2S>${escapeXml(cat.source)}</${tag}G2S>\n`;
    }

    bodyRows += `    <${tag}G3>${fmt(cat.amount)}</${tag}G3>\n`;

    if (cat.agentPaid) {
      bodyRows += `    <${tag}G4>${fmt(cat.pdfo)}</${tag}G4>\n`;
      bodyRows += `    <${tag}G5>${fmt(cat.vz)}</${tag}G5>\n`;
    } else {
      bodyRows += `    <${tag}G6>${fmt(cat.pdfo)}</${tag}G6>\n`;
      bodyRows += `    <${tag}G7>${fmt(cat.vz)}</${tag}G7>\n`;
    }
  }

  // Non-taxable totals
  const nonTaxable = result.categories.filter((c) =>
    NON_TAXABLE.has(c.category)
  );
  let nonTaxTotal = 0;
  for (const cat of nonTaxable) {
    const tag = categoryToTag(cat.category);
    bodyRows += `    <${tag}G3>${fmt(cat.amount)}</${tag}G3>\n`;
    nonTaxTotal += cat.amount;
  }
  if (nonTaxTotal > 0) {
    bodyRows += `    <R011G3>${fmt(nonTaxTotal)}</R011G3>\n`;
  }

  // Summary
  bodyRows += `    <R010G3>${fmt(result.totalIncome)}</R010G3>\n`;
  bodyRows += `    <R010G4>${fmt(result.agentPaidPdfo)}</R010G4>\n`;
  bodyRows += `    <R010G5>${fmt(result.agentPaidVz)}</R010G5>\n`;
  bodyRows += `    <R010G6>${fmt(result.selfPaidPdfo)}</R010G6>\n`;
  bodyRows += `    <R010G7>${fmt(result.selfPaidVz)}</R010G7>\n`;
  bodyRows += `    <R012G3>${fmt(result.totalIncome)}</R012G3>\n`;
  bodyRows += `    <R013G3>${fmt(result.totalPdfo)}</R013G3>\n`;

  if (result.foreignTaxCredit > 0) {
    bodyRows += `    <R018G3>${fmt(result.foreignTaxCredit)}</R018G3>\n`;
  }

  bodyRows += `    <R0201G3>${fmt(result.pdfoToPay)}</R0201G3>\n`;
  bodyRows += `    <R0211G3>${fmt(result.vzToPay)}</R0211G3>\n`;

  const xml = `<?xml version="1.0" encoding="windows-1251" standalone="no"?>
<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xsi:noNamespaceSchemaLocation="F0100215.xsd">
  <DECLARHEAD>
    <TIN>${info.tin}</TIN>
    <C_DOC>F01</C_DOC>
    <C_DOC_SUB>002</C_DOC_SUB>
    <C_DOC_VER>12</C_DOC_VER>
    <C_DOC_TYPE>0</C_DOC_TYPE>
    <C_DOC_CNT>1</C_DOC_CNT>
    <C_REG>${cReg}</C_REG>
    <C_RAJ>${cRaj}</C_RAJ>
    <PERIOD_MONTH>12</PERIOD_MONTH>
    <PERIOD_TYPE>5</PERIOD_TYPE>
    <PERIOD_YEAR>${info.year}</PERIOD_YEAR>
    <C_STI_ORIG>${info.stiCode}</C_STI_ORIG>
    <C_DOC_STAN>1</C_DOC_STAN>${linkedDocs}
    <D_FILL>${fillDate}</D_FILL>
    <SOFTWARE>declarua</SOFTWARE>
  </DECLARHEAD>
  <DECLARBODY xsi:type="DECLARBODY_MAIN">
    <H01>1</H01>
${bodyRows}    <H05>1</H05>
    <HBOS>${name}</HBOS>
    <HCITY>${city}</HCITY>
    <HD1>1</HD1>
    <HFILL>${fillDate}</HFILL>
    <HNAME>${name}</HNAME>
    <HSTI></HSTI>
    <HSTREET>${street}</HSTREET>
    <HTIN>${info.tin}</HTIN>
    <HZ>1</HZ>
    <HZY>${info.year}</HZY>
  </DECLARBODY>
</DECLAR>`;

  return toWin1251(xml);
}

export function generateF1Xml(
  info: DeclarationInfo,
  result: TaxResult,
  uuid: string
): Uint8Array {
  const { cReg, cRaj } = regionFromSti(info.stiCode);
  const fillDate = formatFillDate();
  const name = escapeXml(info.fullName);

  const totalProceeds = result.lots.reduce((s, l) => s + l.proceedsUah, 0);
  const totalCost = result.lots.reduce((s, l) => s + l.costUah, 0);
  const totalPnl = Math.round((totalProceeds - totalCost) * 100) / 100;
  const taxableProfit = Math.round(Math.max(0, totalPnl - info.prevLoss) * 100) / 100;
  const pdfo = Math.round(taxableProfit * 0.18 * 100) / 100;
  const vz = Math.round(taxableProfit * 0.05 * 100) / 100;

  let lotRows = "";
  result.lots.forEach((lot, i) => {
    const n = i + 1;
    const qtyStr =
      lot.quantity === Math.floor(lot.quantity)
        ? String(lot.quantity)
        : lot.quantity.toFixed(2);
    const desc = escapeXml(`${lot.symbol} (${qtyStr} шт.)`);
    const profit = Math.round((lot.proceedsUah - lot.costUah) * 100) / 100;

    lotRows += `    <T1RXXXXG2 ROWNUM="${n}">4</T1RXXXXG2>\n`;
    lotRows += `    <T1RXXXXG3S ROWNUM="${n}">${desc}</T1RXXXXG3S>\n`;
    lotRows += `    <T1RXXXXG4 ROWNUM="${n}">${fmt(lot.proceedsUah)}</T1RXXXXG4>\n`;
    lotRows += `    <T1RXXXXG5 ROWNUM="${n}">${fmt(lot.costUah)}</T1RXXXXG5>\n`;
    lotRows += `    <T1RXXXXG6 ROWNUM="${n}">${fmt(profit)}</T1RXXXXG6>\n`;
  });

  const xml = `<?xml version="1.0" encoding="windows-1251" standalone="no"?>
<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xsi:noNamespaceSchemaLocation="F0121215.xsd">
  <DECLARHEAD>
    <TIN>${info.tin}</TIN>
    <C_DOC>F01</C_DOC>
    <C_DOC_SUB>212</C_DOC_SUB>
    <C_DOC_VER>12</C_DOC_VER>
    <C_DOC_TYPE>1</C_DOC_TYPE>
    <C_DOC_CNT>1</C_DOC_CNT>
    <C_REG>${cReg}</C_REG>
    <C_RAJ>${cRaj}</C_RAJ>
    <PERIOD_MONTH>12</PERIOD_MONTH>
    <PERIOD_TYPE>5</PERIOD_TYPE>
    <PERIOD_YEAR>${info.year}</PERIOD_YEAR>
    <C_STI_ORIG>${info.stiCode}</C_STI_ORIG>
    <C_DOC_STAN>1</C_DOC_STAN>
    <LINKED_DOCS>
      <DOC NUM="1" TYPE="2">
        <C_DOC>F01</C_DOC>
        <C_DOC_SUB>002</C_DOC_SUB>
        <C_DOC_VER>12</C_DOC_VER>
        <C_DOC_TYPE>0</C_DOC_TYPE>
        <C_DOC_CNT>1</C_DOC_CNT>
        <C_DOC_STAN>1</C_DOC_STAN>
        <FILENAME>F0100215_Zvit_${uuid}.xml</FILENAME>
      </DOC>
    </LINKED_DOCS>
    <D_FILL>${fillDate}</D_FILL>
    <SOFTWARE>declarua</SOFTWARE>
  </DECLARHEAD>
  <DECLARBODY xsi:type="DECLARBODY_F1">
    <HBOS>${name}</HBOS>
    <HTIN>${info.tin}</HTIN>
    <HZ>1</HZ>
    <HZY>${info.year}</HZY>
    <R001G4>${fmt(totalProceeds)}</R001G4>
    <R001G5>${fmt(totalCost)}</R001G5>
    <R001G6>${fmt(totalPnl)}</R001G6>
    <R003G6>${fmt(taxableProfit)}</R003G6>
    <R004G6>${fmt(pdfo)}</R004G6>
    <R005G6>${fmt(vz)}</R005G6>
    <R031G6>${fmt(taxableProfit)}</R031G6>
    <R042G6>${fmt(pdfo)}</R042G6>
    <R052G6>${fmt(vz)}</R052G6>
${lotRows}  </DECLARBODY>
</DECLAR>`;

  return toWin1251(xml);
}

export function downloadFile(data: Uint8Array, filename: string) {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
