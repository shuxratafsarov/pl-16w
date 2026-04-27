/**
 * Reusable country-detail modal.
 *
 * Shown when the user clicks a country bar (BY/UZ/AZ/KG/etc) in either
 * the weekly overview or the monthly view. Renders KPI cards, a trend
 * series (per week or per month depending on context), subtype breakdown
 * if available, and top contributing parties.
 */
import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtUSD, fmtNum } from "@/lib/format";
import { Globe2, Boxes, Scale, TrendingUp, Wallet, Receipt, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

const COUNTRY_META: Record<string, { label: string; flag: string; color: string }> = {
  UZ: { label: "Узбекистан", flag: "🇺🇿", color: "hsl(220 90% 60%)" },
  BY: { label: "Беларусь", flag: "🇧🇾", color: "hsl(35 90% 55%)" },
  AZ: { label: "Азербайджан", flag: "🇦🇿", color: "hsl(265 80% 60%)" },
  KG: { label: "Киргизия", flag: "🇰🇬", color: "hsl(160 70% 45%)" },
  KZ: { label: "Казахстан", flag: "🇰🇿", color: "hsl(0 70% 55%)" },
};

export type CountryTrendPoint = {
  /** Display label, e.g. "W12" or "Январь" */
  label: string;
  /** Sub-period (date range) shown in tooltip */
  period?: string;
  pcs: number;
  kg: number;
  revenue?: number;
  expense?: number;
  gross_profit?: number;
};

export type CountryDetailData = {
  country: string;
  /** Aggregate totals across the trend points */
  totals: {
    pcs: number;
    kg: number;
    revenue?: number;
    expense?: number;
    gross_profit?: number;
    margin_pct?: number;
  };
  /** % share of overall scope (pieces) */
  share_pct?: number;
  /** Trend across weeks or months */
  trend: CountryTrendPoint[];
  /** Optional subtype split inside the country */
  subtypes?: { name: string; pcs: number; kg: number }[];
  /** Optional top-contributing parties (only for weekly scope) */
  topParties?: { label: string; week?: number; revenue: number; gross_profit: number; margin_pct: number | null }[];
  /** Trend X-axis kind: "week" or "month" */
  trendKind: "week" | "month";
};

export function CountryDetailDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: CountryDetailData | null;
}) {
  const meta = data ? COUNTRY_META[data.country] ?? {
    label: data.country,
    flag: "",
    color: "hsl(210 60% 60%)",
  } : null;

  const hasMoney = useMemo(
    () => !!data && (data.totals.revenue ?? 0) > 0,
    [data]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {data && meta && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-2xl">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold text-white"
                  style={{ backgroundColor: meta.color }}
                >
                  {meta.flag || data.country}
                </span>
                <span>{meta.label}</span>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  <Globe2 className="h-3 w-3" />
                  {data.country}
                </span>
              </DialogTitle>
              <DialogDescription>
                Детализация по {data.trendKind === "week" ? "неделям" : "месяцам"} ·{" "}
                источник: 3PL_{data.trendKind === "week" ? "weekly" : "monthly"}
                {data.share_pct != null && (
                  <span className="ml-2 font-semibold text-foreground">
                    {data.share_pct.toFixed(1)}% от общего объёма
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCell icon={Boxes} label="Штук" value={fmtNum(data.totals.pcs, 0)} accent={meta.color} />
              <KpiCell icon={Scale} label="Килограмм" value={fmtNum(data.totals.kg, 1)} accent={meta.color} />
              {hasMoney ? (
                <>
                  <KpiCell icon={Wallet} label="Выручка" value={fmtUSD(data.totals.revenue ?? 0)} accent="var(--primary)" />
                  <KpiCell
                    icon={Percent}
                    label="Маржа"
                    value={`${(data.totals.margin_pct ?? 0).toFixed(1)}%`}
                    accent={
                      (data.totals.margin_pct ?? 0) >= 15
                        ? "var(--success)"
                        : (data.totals.margin_pct ?? 0) >= 5
                          ? "var(--warning)"
                          : "var(--destructive)"
                    }
                  />
                </>
              ) : (
                <KpiCell
                  icon={TrendingUp}
                  label="Доля от объёма"
                  value={`${(data.share_pct ?? 0).toFixed(1)}%`}
                  accent={meta.color}
                />
              )}
            </div>

            {hasMoney && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MoneyCell label="Выручка" value={data.totals.revenue ?? 0} icon={Wallet} color="var(--primary)" />
                <MoneyCell label="Расходы" value={data.totals.expense ?? 0} icon={Receipt} color="var(--destructive)" />
                <MoneyCell label="Валовая прибыль" value={data.totals.gross_profit ?? 0} icon={TrendingUp} color="var(--success)" />
              </div>
            )}

            {/* Trend */}
            {data.trend.length > 0 && (
              <div className="rounded-xl border border-border bg-card/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">
                    Динамика по {data.trendKind === "week" ? "неделям" : "месяцам"}
                  </h4>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Штуки + {hasMoney ? "выручка" : "вес"}
                  </span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer>
                    <ComposedChart data={data.trend} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis
                        yAxisId="left"
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        tickFormatter={(v) => fmtNum(v, 0)}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        tickFormatter={(v) =>
                          hasMoney ? `${(v / 1000).toFixed(0)}k` : `${v.toFixed(0)}`
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        formatter={(v: number, n: string) => {
                          if (n === "Выручка" || n === "Расходы" || n === "Прибыль") return [fmtUSD(v), n];
                          if (n === "Кг") return [`${fmtNum(v, 1)} кг`, n];
                          return [`${fmtNum(v, 0)} шт`, n];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        yAxisId="left"
                        dataKey="pcs"
                        name="Штук"
                        fill={meta.color}
                        radius={[4, 4, 0, 0]}
                        opacity={0.85}
                      />
                      {hasMoney ? (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="revenue"
                          name="Выручка"
                          stroke="var(--primary)"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      ) : (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="kg"
                          name="Кг"
                          stroke="var(--accent-foreground)"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Subtypes */}
            {data.subtypes && data.subtypes.length > 0 && (
              <div className="rounded-xl border border-border bg-card/40 p-4">
                <h4 className="mb-3 text-sm font-semibold">Структура по подтипам</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-2 py-2 font-semibold">Подтип</th>
                        <th className="px-2 py-2 font-semibold text-right">Штук</th>
                        <th className="px-2 py-2 font-semibold text-right">Кг</th>
                        <th className="px-2 py-2 font-semibold text-right">% штук</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.subtypes.map((s) => {
                        const pct = data.totals.pcs > 0 ? (s.pcs / data.totals.pcs) * 100 : 0;
                        return (
                          <tr key={s.name} className="border-b border-border/40 hover:bg-muted/30">
                            <td className="px-2 py-2 font-mono text-foreground">{s.name}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-semibold">
                              {fmtNum(s.pcs, 0)}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                              {fmtNum(s.kg, 1)}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-2 text-right tabular-nums font-semibold",
                                pct >= 50 ? "text-destructive" : pct >= 25 ? "text-warning" : "text-muted-foreground"
                              )}
                            >
                              {pct.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top parties */}
            {data.topParties && data.topParties.length > 0 && (
              <div className="rounded-xl border border-border bg-card/40 p-4">
                <h4 className="mb-3 text-sm font-semibold">Топ‑партии (по прибыли)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-2 py-2 font-semibold">Партия</th>
                        <th className="px-2 py-2 font-semibold">Неделя</th>
                        <th className="px-2 py-2 font-semibold text-right">Выручка</th>
                        <th className="px-2 py-2 font-semibold text-right">Прибыль</th>
                        <th className="px-2 py-2 font-semibold text-right">Маржа</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topParties.map((p, i) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-muted/30">
                          <td className="px-2 py-2 font-mono">{p.label}</td>
                          <td className="px-2 py-2 text-muted-foreground">{p.week ? `W${p.week}` : "—"}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmtUSD(p.revenue)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-success">
                            {fmtUSD(p.gross_profit)}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-2 text-right tabular-nums font-semibold",
                              (p.margin_pct ?? 0) >= 15
                                ? "text-success"
                                : (p.margin_pct ?? 0) >= 5
                                  ? "text-warning"
                                  : "text-destructive"
                            )}
                          >
                            {p.margin_pct != null ? `${p.margin_pct.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KpiCell({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <Icon className="h-3 w-3" style={{ color: accent }} />
        {label}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function MoneyCell({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <Icon className="h-3 w-3" style={{ color }} />
        {label}
      </div>
      <p className="mt-1 text-base font-bold tabular-nums" style={{ color }}>
        {fmtUSD(value)}
      </p>
    </div>
  );
}
