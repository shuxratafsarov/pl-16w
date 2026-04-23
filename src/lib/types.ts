export type Party = {
  col: number;
  col_letter: string;
  name: string;
  num: string;
  type: "CAINIAO" | "MPO" | "MKO";
  date: string;
  revenue_total: number | null;
  revenue_cainiao: number | null;
  revenue_uzumcb: number | null;
  expense_total: number | null;
  expense_cainiao: number | null;
  expense_uzumcb: number | null;
  gross_profit: number | null;
  marker1_tariff: number | null;
  marker2_volnet: number | null;
  marker3_grossnet: number | null;
  weight_gross: number | null;
  weight_volume: number | null;
  weight_net: number | null;
  products: {
    UZ: { total: number | null; RM: number | null; SRM: number | null; SRMA: number | null; SRMB: number | null; SRMC: number | null };
    BY: { total: number | null; RRM: number | null; SRM: number | null; NRM: number | null };
    KG: { total: number | null; RM: number | null; NRM: number | null };
    AZ: { total: number | null; RM: number | null; NRM: number | null };
  };
};

export type WeekData = {
  week: number;
  period: string;
  totals: {
    revenue_total: number;
    revenue_cainiao: number;
    revenue_uzumcb: number;
    expense_total: number;
    expense_cainiao: number;
    expense_uzumcb: number;
    gross_profit: number;
    weight_gross: number;
    weight_volume: number;
    weight_net: number;
  };
  byType: Record<"CAINIAO" | "MPO" | "MKO", {
    count: number;
    revenue: number;
    expense: number;
    gross_profit: number;
    weight_gross: number;
    weight_volume: number;
    weight_net: number;
  }>;
  parties: Party[];
};
