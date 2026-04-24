export type PartyType = "CAINIAO" | "MPO" | "MKO";

export type Party = {
  col: string;
  type: PartyType;
  num: string;
  date: string | null;
  revenue: number;
  expense: number;
  gross_profit: number;
  margin_pct: number | null;
  weight_net: number | null;
  weight_gross: number | null;
  weight_vol: number | null;
  marker1_tariff: number | null;
  marker2_volnet: number | null;
  marker3_grossnet: number | null;
  total_kg: number | null;
};

export type TypeAggregate = {
  count: number;
  revenue: number;
  expense: number;
  gross_profit: number;
  margin_pct: number;
  note?: string;
};

export type WeekData = {
  week: number;
  period: string;
  totals: {
    revenue: number;
    expense: number;
    gross_profit: number;
    margin_pct: number;
  };
  byType: Record<PartyType, TypeAggregate>;
  umbrella_uzum_cb: {
    revenue: number;
    expense: number;
    gross_profit: number;
    margin_pct: number;
  };
  parties: Party[];
};
