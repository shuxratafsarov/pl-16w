import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarRange,
  DollarSign,
  Package,
  Receipt,
  Scale,
  TrendingUp,
} from "lucide-react";
import weekData from "@/data/week16.json";
import type { WeekData, Party } from "@/lib/types";
import { fmtNum, fmtPct, fmtUSD, TYPE_COLOR } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { SectionCard } from "@/components/SectionCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MarkerChart } from "@/components/MarkerChart";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const data = weekData as WeekData;
const TYPES: Array<"CAINIAO" | "MPO" | "MKO"> = ["CAINIAO", "MPO", "MKO"];

const TYPE_HINTS: Record<string, string> = {
  CAINIAO: "Регулярные партии Cainiao (C2M, экспорт)",
  MPO: "UZUM MPO — отправления почтовой логистики",
  MKO: "UZUM MKO — мелкие коммерческие отправления",
};

// Пороги маркеров (по экспертным правилам бизнеса)
const THRESHOLDS = {
  marker1: { critical: 5.0, warning: 4.0, direction: "above" as const, unit: " $/кг" },
  marker2: { critical: 1.5, warning: 1.35, direction: "above" as const },
  marker3: { critical: 1.15, warning: 1.07, direction: "above" as const },
};

function statusOf(value: number, t: { critical: number; warning: number; direction?: "above" | "below" }) {
  const dir = t.direction ?? "above";
  if (dir === "above") {
    if (value >= t.critical) return "critical" as const;
    if (value >= t.warning) return "warning" as const;
    return "ok" as const;
  }
  if (value <= t.critical) return "critical" as const;
  if (value <= t.warning) return "warning" as const;
  return "ok" as const;
}

function Dashboard() {
  const [activeType, setActiveType] = useState<"ALL" | "CAINIAO" | "MPO" | "MKO">("ALL");

  const filteredParties = useMemo<Party[]>(
    () => (activeType === "ALL" ? data.parties : data.parties.filter((p) => p.type === activeType)),
    [activeType]
  );

  const margin = data.totals.revenue_total - data.totals.expense_total;
  const marginPct = margin / data.totals.revenue_total;

  // Данные для верхней диаграммы — выручка vs расходы по типам
  const typeBarData = TYPES.map((t) => ({
    type: t,
    Выручка: data.byType[t].revenue,
    Расходы: data.byType[t].expense,
    Маржа: data.byType[t].revenue - data.byType[t].expense,
  }));

  const revenuePieData = TYPES.map((t) => ({
    name: t,
    value: data.byType[t].revenue,
  }));

  const expensePieData = TYPES.map((t) => ({
    name: t,
    value: data.byType[t].expense,
  }));

  // Сводка по маркерам — счётчики критичных/предупреждений
  const markerSummary = useMemo(() => {
    const sum = (key: "marker1_tariff" | "marker2_volnet" | "marker3_grossnet", t: typeof THRESHOLDS.marker1) => {
      const vals = filteredParties
        .map((p) => p[key])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      const stats = vals.map((v) => statusOf(v, t));
      return {
        total: vals.length,
        critical: stats.filter((s) => s === "critical").length,
        warning: stats.filter((s) => s === "warning").length,
        avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0,
        max: vals.length ? Math.max(...vals) : 0,
        min: vals.length ? Math.min(...vals) : 0,
      };
    };
    return {
      m1: sum("marker1_tariff", THRESHOLDS.marker1),
      m2: sum("marker2_volnet", THRESHOLDS.marker2),
      m3: sum("marker3_grossnet", THRESHOLDS.marker3),
    };
  }, [filteredParties]);

  // Маркер 4 — соотношение продуктов (по штукам), агрегируем по CAINIAO партиям
  const cainiaoParties = data.parties.filter((p) => p.type === "CAINIAO");
  const productMix = useMemo(() => {
    const directions = ["UZ", "BY", "KG", "AZ"] as const;
    return directions.map((dir) => {
      const totals: Record<string, number> = {};
      let weightSum = 0;
      cainiaoParties.forEach((p) => {
        const d = p.products[dir] as Record<string, number | null>;
        const total = d.total ?? 0;
        weightSum += total;
        Object.entries(d).forEach(([k, v]) => {
          if (k === "total" || v == null) return;
          totals[k] = (totals[k] ?? 0) + v * total;
        });
      });
      const result: Record<string, number> = {};
      Object.entries(totals).forEach(([k, v]) => {
        result[k] = weightSum ? v / weightSum : 0;
      });
      return { dir, total: weightSum, mix: result };
    });
  }, [cainiaoParties]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-primary">3PL · P&amp;L 2026</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              Аналитика по маркерам · Неделя {data.week}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
              <CalendarRange className="h-4 w-4" />
              {data.period}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-8 px-6 py-8">
        {/* Hero summary */}
        <SectionCard
          title="1. Общие итоги недели"
          description="Сводные показатели по всем партиям за неделю 16 (13–19 апреля 2026)."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Выручка"
              value={fmtUSD(data.totals.revenue_total)}
              hint={`${data.parties.length} партий`}
              accent="primary"
              icon={<DollarSign className="h-5 w-5" />}
            />
            <StatCard
              label="Расходы"
              value={fmtUSD(data.totals.expense_total)}
              hint={`${fmtPct(data.totals.expense_total / data.totals.revenue_total)} от выручки`}
              accent="destructive"
              icon={<Receipt className="h-5 w-5" />}
            />
            <StatCard
              label="Маржа"
              value={fmtUSD(margin)}
              hint={`${fmtPct(marginPct)} маржинальность`}
              accent={margin > 0 ? "success" : "destructive"}
              icon={margin > 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
            />
            <StatCard
              label="Вес нетто"
              value={`${fmtNum(data.totals.weight_net)} кг`}
              hint={`Брутто ${fmtNum(data.totals.weight_gross)} · Объёмный ${fmtNum(data.totals.weight_volume)}`}
              accent="default"
              icon={<Scale className="h-5 w-5" />}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <p className="mb-3 text-sm font-medium text-card-foreground">Выручка vs Расходы по типам партий</p>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={typeBarData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="type" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickFormatter={(v) => `$${(v as number) >= 1000 ? `${((v as number) / 1000).toFixed(0)}k` : v}`}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--popover-foreground)",
                        fontSize: 12,
                      }}
                      formatter={(v: number) => fmtUSD(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Выручка" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Расходы" fill="var(--destructive)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Маржа" fill="var(--success)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-4">
              <MiniPie title="Структура выручки" data={revenuePieData} />
              <MiniPie title="Структура расходов" data={expensePieData} />
            </div>
          </div>
        </SectionCard>

        {/* По типам — карточки */}
        <SectionCard
          title="2. Разбивка по типам партий"
          description="CAINIAO — регулярные C2M, MPO — почтовые отправления, MKO — мелкие коммерческие отправления."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {TYPES.map((t) => {
              const d = data.byType[t];
              const m = d.revenue - d.expense;
              const mp = d.revenue ? m / d.revenue : 0;
              return (
                <div
                  key={t}
                  className="rounded-xl border bg-card p-5 shadow-sm"
                  style={{ borderTopWidth: 4, borderTopColor: TYPE_COLOR[t] }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight">{t}</h3>
                      <p className="text-xs text-muted-foreground">{TYPE_HINTS[t]}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {d.count} партий
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Выручка</dt>
                      <dd className="font-semibold tabular-nums">{fmtUSD(d.revenue)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Расходы</dt>
                      <dd className="font-semibold tabular-nums">{fmtUSD(d.expense)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Маржа</dt>
                      <dd className={cn("font-semibold tabular-nums", m >= 0 ? "text-success" : "text-destructive")}>
                        {fmtUSD(m)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Маржинальность</dt>
                      <dd className={cn("font-semibold tabular-nums", mp >= 0 ? "text-success" : "text-destructive")}>
                        {fmtPct(mp)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Вес нетто</dt>
                      <dd className="font-semibold tabular-nums">{fmtNum(d.weight_net)} кг</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Вес объёмный</dt>
                      <dd className="font-semibold tabular-nums">{fmtNum(d.weight_volume)} кг</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* МАРКЕРЫ */}
        <SectionCard
          title="3. Анализ по маркерам"
          description="Маркеры — индикаторы, помогающие быстро увидеть отклонения и точки внимания."
          action={
            <div className="flex flex-wrap gap-1 rounded-lg border bg-muted p-1 text-sm">
              {(["ALL", ...TYPES] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveType(t)}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-medium transition-colors",
                    activeType === t
                      ? "bg-card text-card-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === "ALL" ? "Все" : t}
                </button>
              ))}
            </div>
          }
        >
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <MarkerSummaryCard
              title="Маркер 1 · Тариф лайнхолл"
              summary={markerSummary.m1}
              unit=" $/кг"
              decimals={2}
              critical={THRESHOLDS.marker1.critical}
              warning={THRESHOLDS.marker1.warning}
            />
            <MarkerSummaryCard
              title="Маркер 2 · Объёмный / Нетто"
              summary={markerSummary.m2}
              decimals={3}
              critical={THRESHOLDS.marker2.critical}
              warning={THRESHOLDS.marker2.warning}
            />
            <MarkerSummaryCard
              title="Маркер 3 · Брутто / Нетто"
              summary={markerSummary.m3}
              decimals={3}
              critical={THRESHOLDS.marker3.critical}
              warning={THRESHOLDS.marker3.warning}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <MarkerBlock
              title="Маркер 1 — Тариф лайнхолл, $/кг"
              description="Стоимость авиадоставки Китай → Ташкент по контрагенту. Источник: лист Expenses (колонка AF)."
              parties={filteredParties}
              metric="marker1_tariff"
              threshold={THRESHOLDS.marker1}
              decimals={2}
              yLabel="$/кг"
            />
            <MarkerBlock
              title="Маркер 2 — Коэффициент объёмного веса к нетто"
              description="Чем выше коэффициент — тем больше «воздуха» возим. Норма ≤ 1.35."
              parties={filteredParties}
              metric="marker2_volnet"
              threshold={THRESHOLDS.marker2}
              decimals={3}
              yLabel="vol/net"
            />
            <MarkerBlock
              title="Маркер 3 — Коэффициент брутто веса к нетто"
              description="Доля упаковки и тары в массе. Норма ≤ 1.07."
              parties={filteredParties}
              metric="marker3_grossnet"
              threshold={THRESHOLDS.marker3}
              decimals={3}
              yLabel="gross/net"
            />
            <ProductMixBlock productMix={productMix} />
          </div>
        </SectionCard>

        {/* Детальная таблица */}
        <SectionCard
          title="4. Детализация по партиям"
          description="Все партии недели с отметками статусов по маркерам."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Партия</th>
                  <th className="py-2 pr-3 font-medium">Тип</th>
                  <th className="py-2 pr-3 font-medium">Дата</th>
                  <th className="py-2 pr-3 text-right font-medium">Выручка</th>
                  <th className="py-2 pr-3 text-right font-medium">Расход</th>
                  <th className="py-2 pr-3 text-right font-medium">Нетто, кг</th>
                  <th className="py-2 pr-3 text-right font-medium">М1 тариф</th>
                  <th className="py-2 pr-3 text-right font-medium">М2 vol/net</th>
                  <th className="py-2 pr-3 text-right font-medium">М3 gross/net</th>
                </tr>
              </thead>
              <tbody>
                {filteredParties.map((p) => {
                  const m1 = p.marker1_tariff;
                  const m2 = p.marker2_volnet;
                  const m3 = p.marker3_grossnet;
                  return (
                    <tr key={p.col} className="border-b last:border-b-0 hover:bg-accent/40">
                      <td className="py-2.5 pr-3 font-medium">{p.num}</td>
                      <td className="py-2.5 pr-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: `color-mix(in oklab, ${TYPE_COLOR[p.type]} 15%, transparent)`, color: TYPE_COLOR[p.type] }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLOR[p.type] }} />
                          {p.type}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{p.date}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{p.revenue_total != null ? fmtUSD(p.revenue_total) : "—"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{p.expense_total != null ? fmtUSD(p.expense_total) : "—"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{p.weight_net != null ? fmtNum(p.weight_net, 1) : "—"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {typeof m1 === "number" ? (
                          <MetricCell value={fmtNum(m1, 2)} status={statusOf(m1, THRESHOLDS.marker1)} />
                        ) : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {typeof m2 === "number" ? (
                          <MetricCell value={fmtNum(m2, 3)} status={statusOf(m2, THRESHOLDS.marker2)} />
                        ) : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {typeof m3 === "number" ? (
                          <MetricCell value={fmtNum(m3, 3)} status={statusOf(m3, THRESHOLDS.marker3)} />
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <footer className="pt-4 text-center text-xs text-muted-foreground">
          Данные: 3PL_PL_2026 · лист 3PL_weekly · тарифы из листа Expenses · период {data.period}
        </footer>
      </main>
    </div>
  );
}

function MetricCell({ value, status }: { value: string; status: "ok" | "warning" | "critical" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1.5 rounded px-1.5 py-0.5",
        status === "critical" && "bg-destructive/10 text-destructive font-semibold",
        status === "warning" && "bg-warning/15 text-warning font-medium",
        status === "ok" && "text-foreground"
      )}
    >
      {value}
    </span>
  );
}

function MarkerSummaryCard({
  title,
  summary,
  decimals = 2,
  unit = "",
  critical,
  warning,
}: {
  title: string;
  summary: { total: number; critical: number; warning: number; avg: number; max: number; min: number };
  decimals?: number;
  unit?: string;
  critical: number;
  warning: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Среднее</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtNum(summary.avg, decimals)}{unit}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Макс</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtNum(summary.max, decimals)}{unit}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Мин</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtNum(summary.min, decimals)}{unit}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" />
          порог {fmtNum(warning, decimals)} / крит {fmtNum(critical, decimals)}
        </div>
        <div className="flex gap-1">
          {summary.critical > 0 && <StatusBadge status="critical" label={`${summary.critical} крит`} />}
          {summary.warning > 0 && <StatusBadge status="warning" label={`${summary.warning} вним.`} />}
          {summary.critical === 0 && summary.warning === 0 && summary.total > 0 && <StatusBadge status="ok" label="всё в норме" />}
        </div>
      </div>
    </div>
  );
}

function MarkerBlock({
  title,
  description,
  parties,
  metric,
  threshold,
  decimals,
  yLabel,
}: {
  title: string;
  description: string;
  parties: Party[];
  metric: "marker1_tariff" | "marker2_volnet" | "marker3_grossnet";
  threshold: { critical: number; warning: number; direction?: "above" | "below"; unit?: string };
  decimals: number;
  yLabel: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <MarkerChart parties={parties} metric={metric} threshold={threshold} decimals={decimals} yLabel={yLabel} />
    </div>
  );
}

function ProductMixBlock({
  productMix,
}: {
  productMix: Array<{ dir: string; total: number; mix: Record<string, number> }>;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-card-foreground">Маркер 4 — Соотношение продуктов (шт)</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Доли типов продуктов внутри каждого направления. Помогает увидеть структуру отгрузок и быстро заметить аномалии.
        </p>
      </div>
      <div className="space-y-4">
        {productMix.map(({ dir, total, mix }) => {
          const entries = Object.entries(mix);
          if (!entries.length || total === 0) return null;
          return (
            <div key={dir}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-semibold uppercase tracking-wider text-muted-foreground">
                    {dir}
                  </span>
                  <span className="text-muted-foreground">{fmtNum(total)} шт</span>
                </div>
              </div>
              <div className="flex h-7 overflow-hidden rounded-md border">
                {entries.map(([k, v], i) => (
                  <div
                    key={k}
                    title={`${k}: ${fmtPct(v)}`}
                    className="flex items-center justify-center text-[10px] font-medium text-white transition-opacity hover:opacity-90"
                    style={{
                      width: `${v * 100}%`,
                      background: `var(--chart-${(i % 5) + 1})`,
                    }}
                  >
                    {v > 0.06 ? `${k} ${fmtPct(v, 0)}` : ""}
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {entries.map(([k, v]) => (
                  <span key={k} className="tabular-nums">
                    {k}: {fmtPct(v)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniPie({ title, data }: { title: string; data: Array<{ name: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="flex items-center gap-3">
        <div className="h-28 w-28 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={28} outerRadius={50} paddingAngle={2}>
                {data.map((d) => (
                  <Cell key={d.name} fill={TYPE_COLOR[d.name]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "var(--popover-foreground)",
                }}
                formatter={(v: number) => fmtUSD(v)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 space-y-1.5 text-xs">
          {data.map((d) => (
            <li key={d.name} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TYPE_COLOR[d.name] }} />
                {d.name}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {total ? fmtPct(d.value / total) : "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export { Dashboard };
