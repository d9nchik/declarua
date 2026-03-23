import type { DpsIncomeRow } from "./types";

const CODE_TO_CATEGORY: Record<string, string> = {
  "101": "10.1",
  "185": "10.1",
  "102": "10.2",
  "103": "10.2",
  "109": "10.4",
  "142": "10.4",
  "104": "10.5",
  "105": "10.5",
  "106": "10.6",
  "164": "10.6",
  "195": "10.6",
  "112": "10.8",
  "114": "10.9",
  "115": "10.9",
  "170": "10.10",
  "180": "10.10",
  "120": "10.13",
  "124": "10.13",
  "125": "10.13",
  "126": "10.13",
  "127": "10.13",
  "503": "11.1",
  "506": "11.1",
  "509": "11.1",
  "512": "11.1",
  "128": "11.3",
  "129": "11.3",
  "151": "11.3",
  "160": "11.3",
  "183": "11.3",
  "204": "11.3",
};

const EXCLUDED_CODES = new Set(["157"]);

function guessCategory(description: string): string {
  const lower = description.toLowerCase();
  if (
    /іноземн|foreign|dividend|usa|us |сша/.test(lower)
  ) {
    return "10.10";
  }
  if (/фоп|підприємниц/.test(lower)) {
    return "11.1";
  }
  return "";
}

export function parseDpsXml(xmlText: string): DpsIncomeRow[] {
  // Try windows-1251 decode, then fall back to utf-8
  let text = xmlText;
  if (text.includes('encoding="windows-1251"')) {
    text = text.replace('encoding="windows-1251"', 'encoding="UTF-8"');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Невірний формат XML файлу ДПС");
  }

  // Collect all unique ROWNUMs
  const rowNums = new Set<string>();
  const allElements = doc.querySelectorAll("[ROWNUM]");
  for (const el of allElements) {
    const rn = el.getAttribute("ROWNUM");
    if (rn) rowNums.add(rn);
  }

  const rows: DpsIncomeRow[] = [];

  for (const rowNum of rowNums) {
    const getTag = (prefix: string): string => {
      // Match tags like T1R{XXXX}G{N} or T1R{XXXX}G{N}S with ROWNUM
      const el = doc.querySelector(
        `[ROWNUM="${rowNum}"]`
      );
      // Actually we need to find specific tags by pattern
      const candidates = doc.querySelectorAll(`[ROWNUM="${rowNum}"]`);
      for (const c of candidates) {
        if (c.tagName.startsWith(prefix)) {
          return c.textContent?.trim() ?? "";
        }
      }
      return "";
    };

    const getTagByPattern = (pattern: string): string => {
      const candidates = doc.querySelectorAll(`[ROWNUM="${rowNum}"]`);
      for (const c of candidates) {
        if (c.tagName.includes(pattern)) {
          return c.textContent?.trim() ?? "";
        }
      }
      return "";
    };

    const date = getTagByPattern("G3S") || getTagByPattern("G4");
    const agentCode = getTagByPattern("G5S");
    const description = getTagByPattern("G6S");
    const amountStr = getTagByPattern("G7") || getTagByPattern("G8");
    const taxPaidStr = getTagByPattern("G10");
    const militaryLevyStr = getTagByPattern("G12");
    const codeNameStr = getTagByPattern("G13S");

    const amount = parseFloat(amountStr) || 0;
    if (amount === 0) continue;

    // Skip totals
    if (
      /всього|разом/i.test(description) &&
      !codeNameStr
    ) {
      continue;
    }

    // Parse income code from "CODE - Name" format
    let incomeCode = "";
    let incomeName = "";
    const codeMatch = codeNameStr.match(/^(\d{3,4})\s*-\s*(.+)/);
    if (codeMatch) {
      incomeCode = codeMatch[1];
      incomeName = codeMatch[2];
    }

    if (EXCLUDED_CODES.has(incomeCode)) continue;

    let category = CODE_TO_CATEGORY[incomeCode] ?? "";
    if (!category) {
      category = guessCategory(description);
    }

    rows.push({
      rowNum,
      date,
      agentCode,
      description,
      amount,
      taxPaid: parseFloat(taxPaidStr) || 0,
      militaryLevyPaid: parseFloat(militaryLevyStr) || 0,
      incomeCode,
      incomeName,
      category,
    });
  }

  // Special handling for FOP (11.1): if multiple codes map to 11.1,
  // keep only code "512" rows if any exist
  const fopRows = rows.filter((r) => r.category === "11.1");
  const has512 = fopRows.some((r) => r.incomeCode === "512");
  if (has512 && fopRows.length > 1) {
    const toRemove = new Set(
      fopRows.filter((r) => r.incomeCode !== "512").map((r) => r.rowNum)
    );
    return rows.filter((r) => !toRemove.has(r.rowNum));
  }

  return rows;
}
