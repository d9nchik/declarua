import type { DeclarationInfo } from "./types";

const STORAGE_KEY = "declarua-info";

const DEFAULT_INFO: DeclarationInfo = {
  year: new Date().getFullYear() - 1,
  fullName: "",
  tin: "",
  stiCode: "",
  city: "",
  street: "",
  prevLoss: 0,
  applyForeignTaxCredit: true,
};

export function loadInfo(): DeclarationInfo {
  if (typeof window === "undefined") return DEFAULT_INFO;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_INFO;
    return { ...DEFAULT_INFO, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_INFO;
  }
}

export function saveInfo(info: DeclarationInfo) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
}
