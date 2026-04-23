export const fmtUSD = (v: number, digits = 0) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(v);

export const fmtNum = (v: number, digits = 0) =>
  new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(v);

export const fmtPct = (v: number, digits = 1) =>
  `${(v * 100).toFixed(digits)}%`;

export const TYPE_COLOR: Record<string, string> = {
  CAINIAO: "var(--cainiao)",
  MPO: "var(--mpo)",
  MKO: "var(--mko)",
};
