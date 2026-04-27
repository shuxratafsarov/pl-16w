/**
 * VolumeAndBreakdown — переиспользуемый блок аналитики:
 *  1. KPI по объёму (шт, кг, средн.вес посылки)
 *  2. Двойной тренд по периодам (шт + кг на двух осях)
 *  3. Stacked-бар по периодам с переключателем «метрика × разрез»
 *     метрика: Выручка / Расходы / Прибыль / Шт / Кг
 *     разрез:  по странам / по типам
 *  4. Матрица «Страна × Тип» — Rev/Exp/GP/Margin (хитмап по марже)
 *
 * Данные подаются заранее агрегированные, чтобы блок работал и для недель,
 * и для месяцев без знания о источнике.
 */
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Boxes, Scale, Package, Layers, Globe2, BarChart3 } from "lucide-react";
import { fmtNum, fmtUSD } from "@/lib/format";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { cn } from "@/lib/utils";

export type VBSliceKey = string; // "UZ"|"BY"|... либо "CAINIAO"|"MPO"|"MKO"

export type VBPeriodPoint = {
  /** короткая подпись на оси X — "W17" или "Апрель" */
  label: string;
  /** период-описание для тултипа */
  period?: string;
  /** агрегаты по периоду (всё за период) */
  pcs: number;
  kg: number;
  revenue: number;
  expense: number;
  gross_profit: number;
  /** значения по странам/типам в этом периоде, ключ = код */
  byCountry: Record<string, { pcs: number; kg: number; revenue: number; expense: number; gross_profit: number }>;
  byType: Record<string, { pcs: number; kg: number; revenue: number; expense: number; gross_profit: number }>;
};

export type VBSlice = {
  key: string;        // "UZ" / "CAINIAO"
  label: string;      // "Узбекистан" / "CAINIAO"
  color: string;      // css-цвет / var()
};

type Props = {
  /** Подпись периода (Неделя / Месяц) */
  periodKind: "week" | "month";
  data: VBPeriodPoint[];
  countries: VBSlice[];
  types: VBSlice[];
  /** Заголовок секции "Объём" */
  title?: string;
  /** Клик по KPI карточкам объёма */
  onKpiClick?: (kpi: "pcs" | "kg" | "avgw" | "rev_per_pcs") => void;
  /** Клик по столбику в stacked-чарте — передаёт label периода */
  onPeriodClick?: (label: string) => void;
  /** Клик по ячейке матрицы Страна × Тип */
  onMatrixCellClick?: (country: string, type: string) => void;
};

type MetricKey = "revenue" | "expense" | "gross_profit" | "pcs" | "kg";
const METRIC: Record<MetricKey, { label: string; format: (v: number) => string; tickFmt: (v: number) => string; isCurrency: boolean }> = {
  revenue: { label: "Выручка", format: (v) => fmtUSD(v), tickFmt: (v) => `$${(v / 1000).toFixed(0)}k`, isCurrency: true },
  expense: { label: "Расходы", format: (v) => fmtUSD(v), tickFmt: (v) => `$${(v / 1000).toFixed(0)}k`, isCurrency: true },
  gross_profit: { label: "Прибыль", format: (v) => fmtUSD(v), tickFmt: (v) => `$${(v / 1000).toFixed(0)}k`, isCurrency: true },
  pcs: { label: "Штуки", format: (v) => `${fmtNum(v, 0)} шт`, tickFmt: (v) => `${(v / 1000).toFixed(0)}k`, isCurrency: false },
  kg: { label: "Килограммы", format: (v) => `${fmtNum(v, 1)} кг`, tickFmt: (v) => `${(v / 1000).toFixed(1)}т`, isCurrency: false },
};

type SliceMode = "country" | "type";

export function VolumeAndBreakdown({ periodKind, data, countries, types, title, onKpiClick, onPeriodClick, onMatrixCellClick }: Props) {
  const [metric, setMetric] = useState<MetricKey>("pcs");
  const [sliceMode, setSliceMode] = useState<SliceMode>("country");

  const totals = useMemo(() => {
    const pcs = data.reduce((s, d) => s + d.pcs, 0);
    const kg = data.reduce((s, d) => s + d.kg, 0);
    const revenue = data.reduce((s, d) => s + d.revenue, 0);
    const expense = data.reduce((s, d) => s + d.expense, 0);
    const gp = revenue - expense;
    const avgWeight = pcs > 0 ? (kg * 1000) / pcs : 0; // граммов на посылку
    return { pcs, kg, revenue, expense, gross_profit: gp, avgWeight };
  }, [data]);

  /** Двойной тренд: шт (бары) + кг (линия) */
  const volumeTrend = useMemo(
    () =>
      data.map((d) => ({
        label: d.label,
        period: d.period,
        Штук: d.pcs,
        Килограммы: Math.round(d.kg),
      })),
    [data]
  );

  const slices = sliceMode === "country" ? countries : types;

  /** Stacked серия: для каждого периода — значения метрики по каждому slice. */
  const stackedSeries = useMemo(() => {
    return data.map((d) => {
      const row: Record<string, number | string | undefined> = { label: d.label, period: d.period };
      const src = sliceMode === "country" ? d.byCountry : d.byType;
      slices.forEach((s) => {
        const v = src[s.key];
        row[s.key] = v ? Number(v[metric] ?? 0) : 0;
      });
      return row;
    });
  }, [data, slices, sliceMode, metric]);

  /** Матрица Страна × Тип — суммарно по всему периоду. */
  const matrix = useMemo(() => {
    type Cell = { revenue: number; expense: number; pcs: number; kg: number };
    const empty = (): Cell => ({ revenue: 0, expense: 0, pcs: 0, kg: 0 });
    const grid: Record<string, Record<string, Cell>> = {};
    countries.forEach((c) => {
      grid[c.key] = {};
      types.forEach((t) => (grid[c.key][t.key] = empty()));
    });
    // Если данные содержат типы только на верхнем уровне (monthly не знает country×type),
    // мы строим матрицу из периодов, где country и type разделены.
    // Для weekly периоды содержат byCountry и byType отдельно — мы их не пересекаем,
    // поэтому матрицу мы строим аппроксимацией: доли страны × итог типа в этом периоде.
    data.forEach((d) => {
      const periodTypeTotalsRev = types.reduce((s, t) => s + (d.byType[t.key]?.revenue ?? 0), 0);
      const periodCountryTotalsRev = countries.reduce((s, c) => s + (d.byCountry[c.key]?.revenue ?? 0), 0);
      countries.forEach((c) => {
        const cv = d.byCountry[c.key];
        if (!cv) return;
        const cShareRev = periodCountryTotalsRev > 0 ? cv.revenue / periodCountryTotalsRev : 0;
        const cSharePcs = d.pcs > 0 ? cv.pcs / d.pcs : 0;
        types.forEach((t) => {
          const tv = d.byType[t.key];
          if (!tv) return;
          // Аллокация типа на страну пропорционально доле страны в выручке периода.
          // Для штук — пропорционально доле страны в штуках периода.
          const cell = grid[c.key][t.key];
          cell.revenue += (tv.revenue ?? 0) * cShareRev;
          cell.expense += (tv.expense ?? 0) * cShareRev;
          cell.pcs += (tv.pcs ?? 0) * cSharePcs;
          cell.kg += (tv.kg ?? 0) * cSharePcs;
        });
      });
    });

    // Итоги
    const rowTotals: Record<string, Cell> = {};
    const colTotals: Record<string, Cell> = {};
    let grandRev = 0;
    let grandExp = 0;
    let grandPcs = 0;
    countries.forEach((c) => {
      rowTotals[c.key] = empty();
      types.forEach((t) => {
        const cell = grid[c.key][t.key];
        rowTotals[c.key].revenue += cell.revenue;
        rowTotals[c.key].expense += cell.expense;
        rowTotals[c.key].pcs += cell.pcs;
        rowTotals[c.key].kg += cell.kg;
      });
      grandRev += rowTotals[c.key].revenue;
      grandExp += rowTotals[c.key].expense;
      grandPcs += rowTotals[c.key].pcs;
    });
    types.forEach((t) => {
      colTotals[t.key] = empty();
      countries.forEach((c) => {
        const cell = grid[c.key][t.key];
        colTotals[t.key].revenue += cell.revenue;
        colTotals[t.key].expense += cell.expense;
        colTotals[t.key].pcs += cell.pcs;
        colTotals[t.key].kg += cell.kg;
      });
    });
    return { grid, rowTotals, colTotals, grandRev, grandExp, grandPcs };
  }, [data, countries, types]);

  const marginColor = (m: number) =>
    m >= 15
      ? "bg-success/15 text-success"
      : m >= 5
        ? "bg-warning/15 text-warning"
        : m >= 0
          ? "bg-muted/40 text-muted-foreground"
          : "bg-destructive/15 text-destructive";

  const periodLabel = periodKind === "week" ? "нед." : "мес.";

  return (
    <div className="space-y-6">
      {/* === Объём KPI === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Σ Штук"
          value={fmtNum(totals.pcs, 0)}
          icon={<Boxes className="h-5 w-5" />}
          accent="primary"
          hint={`за ${data.length} ${periodLabel}`}
          onClick={onKpiClick ? () => onKpiClick("pcs") : undefined}
        />
        <StatCard
          label="Σ Килограмм"
          value={`${fmtNum(totals.kg, 1)} кг`}
          icon={<Scale className="h-5 w-5" />}
          accent="default"
          hint={`${fmtNum(totals.kg / 1000, 2)} тонн`}
          onClick={onKpiClick ? () => onKpiClick("kg") : undefined}
        />
        <StatCard
          label="Средний вес посылки"
          value={`${fmtNum(totals.avgWeight, 0)} г`}
          icon={<Package className="h-5 w-5" />}
          accent="default"
          hint="кг × 1000 / шт"
          onClick={onKpiClick ? () => onKpiClick("avgw") : undefined}
        />
        <StatCard
          label="Выручка / шт"
          value={totals.pcs > 0 ? fmtUSD(totals.revenue / totals.pcs) : "—"}
          icon={<BarChart3 className="h-5 w-5" />}
          accent="success"
          hint="ср. чек на посылку"
          onClick={onKpiClick ? () => onKpiClick("rev_per_pcs") : undefined}
        />
      </div>

      {/* === Двойной тренд: шт + кг === */}
      <SectionCard
        title={title ?? `Динамика объёма · ${periodKind === "week" ? "по неделям" : "по месяцам"}`}
        description="Бары — штуки, линия — килограммы (правая ось)"
      >
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={volumeTrend} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis
                yAxisId="left"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--warning)"
                fontSize={11}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}т`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number, n: string) => (n === "Килограммы" ? [`${fmtNum(v, 0)} кг`, n] : [`${fmtNum(v, 0)} шт`, n])}
                labelFormatter={(l, payload) => {
                  const p = payload?.[0]?.payload as { period?: string } | undefined;
                  return p?.period ? `${l} · ${p.period}` : l;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="Штук" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="Килограммы"
                stroke="var(--warning)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--warning)" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* === Stacked: метрика × разрез === */}
      <SectionCard
        title={`Разбивка по ${periodKind === "week" ? "неделям" : "месяцам"} · ${METRIC[metric].label} ${sliceMode === "country" ? "по странам" : "по типам"}`}
        description="Выберите метрику и разрез — стэк покажет вклад каждой страны или типа в каждом периоде"
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Метрика</span>
          <div className="inline-flex rounded-xl border border-border bg-card/60 p-1 gap-0.5">
            {(Object.keys(METRIC) as MetricKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setMetric(k)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all",
                  metric === k ? "gradient-primary text-white shadow-glow" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {METRIC[k].label}
              </button>
            ))}
          </div>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground ml-2">Разрез</span>
          <div className="inline-flex rounded-xl border border-border bg-card/60 p-1 gap-0.5">
            {(["country", "type"] as SliceMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSliceMode(m)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all inline-flex items-center gap-1",
                  sliceMode === m ? "gradient-primary text-white shadow-glow" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "country" ? <Globe2 className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
                {m === "country" ? "Страны" : "Типы"}
              </button>
            ))}
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={stackedSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={METRIC[metric].tickFmt} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number, n: string) => [METRIC[metric].format(v), n]}
                labelFormatter={(l, payload) => {
                  const p = payload?.[0]?.payload as { period?: string } | undefined;
                  return p?.period ? `${l} · ${p.period}` : l;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {slices.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="stk"
                  fill={s.color}
                  radius={i === slices.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                  cursor={onPeriodClick ? "pointer" : undefined}
                  onClick={
                    onPeriodClick
                      ? (d: { label?: string }) => d?.label && onPeriodClick(d.label)
                      : undefined
                  }
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* === Матрица Страна × Тип === */}
      <SectionCard
        title="Матрица «Страна × Тип» · итог за период"
        description="В каждой ячейке: Выручка / Расходы / Маржа · цвет ячейки по марже. Тип распределяется на страну пропорционально её доле выручки в периоде."
      >
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Страна</th>
                {types.map((t) => (
                  <th key={t.key} className="px-3 py-2 font-semibold text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.label}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 font-semibold text-right bg-muted/30">Σ по стране</th>
              </tr>
            </thead>
            <tbody>
              {countries.map((c) => {
                const rowT = matrix.rowTotals[c.key];
                const rowMargin = rowT.revenue > 0 ? ((rowT.revenue - rowT.expense) / rowT.revenue) * 100 : 0;
                return (
                  <tr key={c.key} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.key}
                        <span className="text-[10px] font-normal text-muted-foreground">{c.label}</span>
                      </span>
                    </td>
                    {types.map((t) => {
                      const cell = matrix.grid[c.key][t.key];
                      const m = cell.revenue > 0 ? ((cell.revenue - cell.expense) / cell.revenue) * 100 : 0;
                      return (
                        <td key={t.key} className="px-2 py-1.5 text-right">
                          <div className={cn("rounded-md px-2 py-1.5 inline-block min-w-[100px] text-right", marginColor(m))}>
                            <div className="text-[11px] font-bold tabular-nums leading-tight">{fmtUSD(cell.revenue)}</div>
                            <div className="text-[9px] tabular-nums opacity-80 leading-tight">−{fmtUSD(cell.expense).replace("$", "$")}</div>
                            <div className="text-[10px] font-bold tabular-nums leading-tight mt-0.5">{m.toFixed(1)}%</div>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right bg-muted/20">
                      <div className="font-bold tabular-nums">{fmtUSD(rowT.revenue)}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">маржа {rowMargin.toFixed(1)}%</div>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted/30 font-bold">
                <td className="px-3 py-2">Σ по типу</td>
                {types.map((t) => {
                  const colT = matrix.colTotals[t.key];
                  const m = colT.revenue > 0 ? ((colT.revenue - colT.expense) / colT.revenue) * 100 : 0;
                  return (
                    <td key={t.key} className="px-3 py-2 text-right">
                      <div className="tabular-nums">{fmtUSD(colT.revenue)}</div>
                      <div className="text-[10px] text-muted-foreground font-normal">{m.toFixed(1)}%</div>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right">
                  <div className="tabular-nums">{fmtUSD(matrix.grandRev)}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">
                    {matrix.grandRev > 0 ? (((matrix.grandRev - matrix.grandExp) / matrix.grandRev) * 100).toFixed(1) : "0.0"}%
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground/80 mt-2 italic">
          *Распределение «тип × страна» — расчётное (доля страны в выручке периода × итог типа), потому что исходные данные не содержат прямого пересечения.
        </p>
      </SectionCard>
    </div>
  );
}
