/**
 * Monthly view — premium analytics for `3PL_monthly` source.
 *
 * Layout:
 *  1. KPI grid (revenue, expense, profit, margin)
 *  2. Trend composed chart (revenue / expense / margin line)
 *  3. Distribution by country — clickable bars + cards (opens CountryDetailDialog)
 *  4. Per-type breakdown (CAINIAO / MPO / MKO)
 *  5. Month-over-month deltas table
 */
import { useMemo, useState } from "react";
import monthlyData from "@/data/monthly.json";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { CountryDetailDialog, type CountryDetailData } from "@/components/CountryDetailDialog";
import { VolumeAndBreakdown, type VBPeriodPoint } from "@/components/VolumeAndBreakdown";
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
import {
  Wallet,
  Receipt,
  TrendingUp,
  Percent,
  Globe2,
  Boxes,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Calendar,
} from "lucide-react";
import { fmtUSD, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

type CountryKey = "UZ" | "BY" | "AZ" | "KG";

type MonthRow = {
  month: number;
  month_name: string;
  period: string;
  revenue: number;
  expense: number;
  gross_profit: number;
  margin_pct: number;
  by_country: Record<CountryKey, {
    revenue: number;
    expense: number;
    gross_profit: number;
    margin_pct: number;
    pcs: number;
    kg: number;
  }>;
  by_type: Record<"CAINIAO" | "MPO" | "MKO", { revenue: number; pcs: number }>;
};

const DATA = monthlyData as MonthRow[];

const COUNTRY_COLORS: Record<string, string> = {
  UZ: "var(--cainiao)",
  BY: "var(--mpo)",
  AZ: "var(--warning)",
  KG: "var(--mko)",
};

const COUNTRY_NAMES: Record<string, string> = {
  UZ: "Узбекистан",
  BY: "Беларусь",
  AZ: "Азербайджан",
  KG: "Киргизия",
};

const TYPE_COLORS: Record<string, string> = {
  CAINIAO: "var(--cainiao)",
  MPO: "var(--mpo)",
  MKO: "var(--mko)",
};

export function MonthlyView() {
  const [countryDrill, setCountryDrill] = useState<string | null>(null);

  const totals = useMemo(() => {
    const revenue = DATA.reduce((s, m) => s + m.revenue, 0);
    const expense = DATA.reduce((s, m) => s + m.expense, 0);
    const gp = revenue - expense;
    const totalPcs = DATA.reduce(
      (s, m) =>
        s +
        Object.values(m.by_country).reduce((ss, c) => ss + c.pcs, 0) +
        m.by_type.MPO.pcs +
        m.by_type.MKO.pcs,
      0
    );
    return {
      revenue,
      expense,
      gross_profit: gp,
      margin_pct: revenue ? (gp / revenue) * 100 : 0,
      pcs: totalPcs,
    };
  }, []);

  const trendData = useMemo(
    () =>
      DATA.map((m) => ({
        name: m.month_name,
        Выручка: Math.round(m.revenue),
        Расходы: Math.round(m.expense),
        Прибыль: Math.round(m.gross_profit),
        Маржа: Number(m.margin_pct.toFixed(2)),
      })),
    []
  );

  const countryAggregate = useMemo(() => {
    const countries: CountryKey[] = ["BY", "UZ", "AZ", "KG"];
    return countries.map((cc) => {
      const pcs = DATA.reduce((s, m) => s + m.by_country[cc].pcs, 0);
      const kg = DATA.reduce((s, m) => s + m.by_country[cc].kg, 0);
      const revenue = DATA.reduce((s, m) => s + m.by_country[cc].revenue, 0);
      const expense = DATA.reduce((s, m) => s + m.by_country[cc].expense, 0);
      return { country: cc, pcs, kg, revenue, expense, gross_profit: revenue - expense };
    });
  }, []);

  const totalCountryPcs = countryAggregate.reduce((s, c) => s + c.pcs, 0);

  /** Build CountryDetailData for the modal when a country is clicked. */
  const countryDetail = useMemo<CountryDetailData | null>(() => {
    if (!countryDrill) return null;
    const cc = countryDrill as CountryKey;
    const trend = DATA.map((m) => ({
      label: m.month_name,
      period: m.period,
      pcs: m.by_country[cc].pcs,
      kg: m.by_country[cc].kg,
      revenue: m.by_country[cc].revenue,
      expense: m.by_country[cc].expense,
      gross_profit: m.by_country[cc].gross_profit,
    })).filter((t) => t.pcs > 0 || (t.revenue ?? 0) > 0);

    const tot = countryAggregate.find((c) => c.country === cc);
    if (!tot) return null;

    return {
      country: cc,
      totals: {
        pcs: tot.pcs,
        kg: Math.round(tot.kg * 10) / 10,
        revenue: tot.revenue,
        expense: tot.expense,
        gross_profit: tot.gross_profit,
        margin_pct: tot.revenue > 0 ? (tot.gross_profit / tot.revenue) * 100 : 0,
      },
      share_pct: totalCountryPcs > 0 ? (tot.pcs / totalCountryPcs) * 100 : 0,
      trend,
      trendKind: "month",
    };
  }, [countryDrill, countryAggregate, totalCountryPcs]);

  /** Per-type aggregate. */
  const typeAggregate = useMemo(() => {
    return (["CAINIAO", "MPO", "MKO"] as const).map((t) => ({
      type: t,
      revenue: DATA.reduce((s, m) => s + m.by_type[t].revenue, 0),
      pcs: DATA.reduce((s, m) => s + m.by_type[t].pcs, 0),
    }));
  }, []);

  /** Данные для VolumeAndBreakdown — по месяцам. */
  const volumeMonthlyData = useMemo<VBPeriodPoint[]>(() => {
    return DATA.map((m) => {
      const byCountry: VBPeriodPoint["byCountry"] = {};
      (Object.keys(m.by_country) as CountryKey[]).forEach((cc) => {
        const v = m.by_country[cc];
        byCountry[cc] = {
          pcs: v.pcs,
          kg: v.kg,
          revenue: v.revenue,
          expense: v.expense,
          gross_profit: v.gross_profit,
        };
      });
      const byType: VBPeriodPoint["byType"] = {};
      (["CAINIAO", "MPO", "MKO"] as const).forEach((t) => {
        const tv = m.by_type[t];
        // Расходы по типам в monthly не выделены — оценим пропорционально доле выручки типа.
        const typeShare = m.revenue > 0 ? tv.revenue / m.revenue : 0;
        const expense = m.expense * typeShare;
        byType[t] = {
          pcs: tv.pcs,
          kg: 0, // в monthly нет кг по типу — оставим 0 (страновой агрегат kg показан в KPI)
          revenue: tv.revenue,
          expense,
          gross_profit: tv.revenue - expense,
        };
      });
      const totalPcs = Object.values(byCountry).reduce((s, v) => s + v.pcs, 0);
      const totalKg = Object.values(byCountry).reduce((s, v) => s + v.kg, 0);
      return {
        label: m.month_name,
        period: m.period,
        pcs: totalPcs,
        kg: totalKg,
        revenue: m.revenue,
        expense: m.expense,
        gross_profit: m.gross_profit,
        byCountry,
        byType,
      };
    });
  }, []);

  /** MoM deltas. */
  const momRows = useMemo(
    () =>
      DATA.map((m, i) => {
        const prev = DATA[i - 1];
        const dRev = prev && prev.revenue > 0 ? ((m.revenue - prev.revenue) / prev.revenue) * 100 : null;
        const dGp = prev && prev.gross_profit !== 0 ? ((m.gross_profit - prev.gross_profit) / Math.abs(prev.gross_profit)) * 100 : null;
        const dMargin = prev ? m.margin_pct - prev.margin_pct : null;
        return { ...m, dRev, dGp, dMargin };
      }),
    []
  );

  return (
    <div className="space-y-6">
      {/* === KPI === */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="Σ Выручка"
          value={fmtUSD(totals.revenue)}
          icon={<Wallet className="h-5 w-5" />}
          accent="primary"
          hint={`${DATA.length} мес. · ${fmtNum(totals.pcs, 0)} шт`}
        />
        <StatCard
          label="Σ Расходы"
          value={fmtUSD(totals.expense)}
          icon={<Receipt className="h-5 w-5" />}
          accent="destructive"
          hint={`${((totals.expense / totals.revenue) * 100).toFixed(1)}% от выручки`}
        />
        <StatCard
          label="Σ Валовая прибыль"
          value={fmtUSD(totals.gross_profit)}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="success"
          hint="Выручка − Расходы"
        />
        <StatCard
          label="Маржа"
          value={`${totals.margin_pct.toFixed(2)}%`}
          icon={<Percent className="h-5 w-5" />}
          accent={totals.margin_pct >= 15 ? "success" : totals.margin_pct >= 5 ? "warning" : "destructive"}
          hint="GP / Выручка"
        />
        <StatCard
          label="Всего посылок"
          value={fmtNum(totals.pcs, 0)}
          icon={<Boxes className="h-5 w-5" />}
          accent="default"
          hint="По 4 странам + MPO/MKO"
        />
      </div>

      {/* === Тренд === */}
      <SectionCard
        title="Помесячная динамика"
        description="Источник: 3PL_monthly · строка 10 (выручка) и строка 94 (расходы)"
      >
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={trendData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis
                yAxisId="left"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number, n: string) => (n === "Маржа" ? [`${v.toFixed(2)}%`, n] : [fmtUSD(v), n])}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="Выручка" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              <Bar yAxisId="left" dataKey="Расходы" fill="var(--destructive)" opacity={0.55} radius={[6, 6, 0, 0]} />
              <Bar yAxisId="left" dataKey="Прибыль" fill="var(--success)" radius={[6, 6, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="Маржа"
                stroke="var(--warning)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "var(--warning)" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* === Распределение по странам — кликабельно === */}
      <SectionCard
        title="География · агрегат за 4 месяца"
        description="Кликните по стране — откроется детальная аналитика с разбивкой по месяцам"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart
                data={countryAggregate}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                layout="vertical"
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => fmtNum(v, 0)} />
                <YAxis type="category" dataKey="country" stroke="var(--muted-foreground)" fontSize={11} width={50} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => [`${fmtNum(v, 0)} шт`, "Штук"]}
                />
                <Bar
                  dataKey="pcs"
                  name="Штук"
                  radius={[0, 6, 6, 0]}
                  cursor="pointer"
                  onClick={(d: { country?: string }) => d?.country && setCountryDrill(d.country)}
                >
                  {countryAggregate.map((c, i) => (
                    <Cell key={i} fill={COUNTRY_COLORS[c.country] ?? "var(--primary)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              <Globe2 className="h-3.5 w-3.5" /> Распределение
              <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-muted-foreground/70">
                кликабельно
              </span>
            </div>
            {countryAggregate.map((c) => {
              const share = totalCountryPcs > 0 ? (c.pcs / totalCountryPcs) * 100 : 0;
              const color = COUNTRY_COLORS[c.country] ?? "var(--primary)";
              const margin = c.revenue > 0 ? (c.gross_profit / c.revenue) * 100 : 0;
              return (
                <button
                  type="button"
                  key={c.country}
                  onClick={() => setCountryDrill(c.country)}
                  className="block w-full text-left rounded-lg border border-border/60 bg-card/40 p-3 transition-all hover:border-primary/60 hover:bg-card/80 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span>{c.country}</span>
                      <span className="text-xs font-normal text-muted-foreground">{COUNTRY_NAMES[c.country]}</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmtNum(c.pcs, 0)} шт · {fmtNum(c.kg, 1)} кг
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, backgroundColor: color }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{share.toFixed(1)}% от объёма</span>
                    <span className="tabular-nums">
                      {fmtUSD(c.revenue)} · маржа{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          margin >= 15 ? "text-success" : margin >= 5 ? "text-warning" : "text-destructive"
                        )}
                      >
                        {margin.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {/* === По типам === */}
      <SectionCard
        title="Структура по каналам"
        description="Распределение выручки и штук между CAINIAO, UZUM MPO и UZUM MKO"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {typeAggregate.map((t) => {
            const share = totals.revenue > 0 ? (t.revenue / totals.revenue) * 100 : 0;
            const color = TYPE_COLORS[t.type];
            return (
              <div
                key={t.type}
                className="rounded-xl border border-border/60 bg-card/60 p-4"
                style={{ borderColor: `color-mix(in oklab, ${color} 35%, var(--border))` }}
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" style={{ color }} />
                  {t.type}
                </div>
                <p className="mt-2 text-xl font-bold tabular-nums" style={{ color }}>
                  {fmtUSD(t.revenue)}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                  {fmtNum(t.pcs, 0)} шт · {share.toFixed(1)}% от выручки
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* === Объём + матрица Страна×Тип === */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-base font-semibold tracking-tight inline-flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" /> Объём, география и продукт · детальная разбивка
          </h3>
          <p className="text-xs text-muted-foreground">
            Динамика по штукам и кг + матрица Страна × Тип по выручке/расходам/марже
          </p>
        </div>
        <VolumeAndBreakdown
          periodKind="month"
          data={volumeMonthlyData}
          countries={(["BY", "UZ", "AZ", "KG"] as CountryKey[]).map((cc) => ({
            key: cc,
            label: COUNTRY_NAMES[cc],
            color: COUNTRY_COLORS[cc],
          }))}
          types={(["CAINIAO", "MPO", "MKO"] as const).map((t) => ({
            key: t,
            label: t,
            color: TYPE_COLORS[t],
          }))}
        />
      </section>

      {/* === MoM таблица === */}
      <SectionCard
        title="Подробно по месяцам · MoM динамика"
        description="Δ — изменение к предыдущему месяцу"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">
                  <div className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" /> Месяц
                  </div>
                </th>
                <th className="px-3 py-2 font-semibold text-right">Выручка</th>
                <th className="px-3 py-2 font-semibold text-right">Расходы</th>
                <th className="px-3 py-2 font-semibold text-right">Прибыль</th>
                <th className="px-3 py-2 font-semibold text-right">Маржа</th>
                <th className="px-3 py-2 font-semibold text-right">Δ Выручка</th>
                <th className="px-3 py-2 font-semibold text-right">Δ Прибыль</th>
                <th className="px-3 py-2 font-semibold text-right">Δ Маржа</th>
              </tr>
            </thead>
            <tbody>
              {momRows.map((m) => (
                <tr key={m.month} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-medium">{m.month_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(m.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtUSD(m.expense)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-success">{fmtUSD(m.gross_profit)}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums",
                        m.margin_pct >= 15
                          ? "bg-success/15 text-success"
                          : m.margin_pct >= 5
                            ? "bg-warning/15 text-warning"
                            : "bg-destructive/15 text-destructive"
                      )}
                    >
                      {m.margin_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeltaBadge value={m.dRev} format="pct" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeltaBadge value={m.dGp} format="pct" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeltaBadge value={m.dMargin} format="pp" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <CountryDetailDialog
        open={!!countryDrill}
        onOpenChange={(o) => !o && setCountryDrill(null)}
        data={countryDetail}
      />
    </div>
  );
}

function DeltaBadge({ value, format }: { value: number | null; format: "pct" | "pp" }) {
  if (value == null) return <span className="text-muted-foreground/60 text-xs">—</span>;
  const positive = value > 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const cls = positive ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground";
  const formatted = format === "pp"
    ? `${value > 0 ? "+" : ""}${value.toFixed(2)} пп`
    : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums font-semibold text-xs", cls)}>
      <Icon className="h-3 w-3" />
      {formatted}
    </span>
  );
}
