export interface DeclarationInfo {
  year: number;
  fullName: string;
  tin: string;
  stiCode: string;
  city: string;
  street: string;
  prevLoss: number;
  applyForeignTaxCredit: boolean;
}

export interface ClosedLot {
  symbol: string;
  description: string;
  currency: string;
  quantity: number;
  buyDate: string; // YYYYMMDD
  sellDate: string; // YYYYMMDD
  costUsd: number;
  proceedsUsd: number;
  pnlUsd: number;
}

export interface Dividend {
  symbol: string;
  currency: string;
  date: string; // YYYYMMDD
  amount: number;
  withholdingTax: number;
  actionId: string;
}

export interface IbkrData {
  accountId: string;
  fromDate: string;
  toDate: string;
  lots: ClosedLot[];
  dividends: Dividend[];
  totalCommission: number;
}

export interface DpsIncomeRow {
  rowNum: string;
  date: string;
  agentCode: string;
  description: string;
  amount: number;
  taxPaid: number;
  militaryLevyPaid: number;
  incomeCode: string;
  incomeName: string;
  category: string;
}

export interface TaxCategory {
  category: string;
  label: string;
  amount: number;
  pdfoRate: number;
  vzRate: number;
  agentPaid: boolean;
  pdfo: number;
  vz: number;
  source?: string;
}

export interface LotWithRates extends ClosedLot {
  buyRate: number;
  sellRate: number;
  costUah: number;
  proceedsUah: number;
  pnlUah: number;
}

export interface DividendWithRates extends Dividend {
  rate: number;
  amountUah: number;
  withholdingTaxUah: number;
}

export interface TaxResult {
  categories: TaxCategory[];
  lots: LotWithRates[];
  dividends: DividendWithRates[];
  totalIncome: number;
  agentPaidPdfo: number;
  agentPaidVz: number;
  selfPaidPdfo: number;
  selfPaidVz: number;
  totalPdfo: number;
  foreignTaxCredit: number;
  pdfoToPay: number;
  vzToPay: number;
  investmentPnl: number;
  investmentTaxableProfit: number;
  totalProceedsUah: number;
  totalCostUah: number;
  totalCommissionUsd: number;
  exchangeRateDiff: number;
  totalDividendsUah: number;
  totalWithholdingUah: number;
}

export type AppPhase = "upload" | "processing" | "report";

export interface ProcessingStep {
  label: string;
  progress: number;
}
