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
import { ArrowDownRight, ArrowUpRight, TrendingUp, Wallet, Receipt, Percent, Activity } from "lucide-react";
import data from "@/data/week16.json";
import type { Party, PartyType, WeekData } from "@/lib/types";
import { fmtUSD, fmtNum, fmtPct } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { MarkerChart } from "@/components/MarkerChart";
import { cn } from "@/lib/utils";

const week = data as WeekData;

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const TYPE_META: Record<PartyType, { label: string; full: string; color: string; accent: "cainiao" | "mpo" | "mko" }> = {
  CAINIAO: { label: "CAINIAO", full: "Cainiao C2M", color: "var(--cainiao)", accent: "cainiao" },
  MPO: { label: "UZUM MPO", full: "UZUM Crossborder · MPO", color: "var(--mpo)", accent: "mpo" },
  MKO: { label: "UZUM MKO", full: "UZUM Crossborder · MKO", color: "var(--mko)", accent: "mko" },
};

// Marker thresholds — based on industry/internal standards
const THRESHOLDS = {
  marker1: { warning: 13, critical: 15, direction: "above" as const, decimals: 2 },
  marker2: { warning: 1.35, critical: 1.5, direction: "above" as const, decimals: 3 },
  marker3: { warning: 1.07, critical: 1.15, direction: "above" as const, decimals: 3 },
};

function statusOf(value: number, t: { critical: number; warning: number; direction?: "above" | "below" }) {
  const dir = t.direction ?? "above";
  if (dir === "above") {
    if (value >= t.critical) return "critical" as const;
    if (value >= t.warning) return "warning" as const;
  } else {
    if (value <= t.critical) return "critical" as const;
    if (value <= t.warning) return "warning" as const;
  }
  return "ok" as const;
}

function Dashboard() {
  const [filter, setFilter] = useState<"ALL" | PartyType>("ALL");

  const parties = useMemo<Party[]>(
    () => (filter === "ALL" ? week.parties : week.parties.filter((p) => p.type === filter)),
    [filter]
  );

  const typeBreakdown = useMemo(
    () =>
      (Object.keys(TYPE_META) as PartyType[]).map((t) => ({
        type: t,
        ...week.byType[t],
      })),
    []
  );

  const revenuePie = typeBreakdown.map((t) => ({ name: TYPE_META[t.type].label, value: t.revenue, fill: TYPE_META[t.type].color }));
  const profitBar = typeBreakdown.map((t) => ({ name: TYPE_META[t.type].label, revenue: t.revenue, expense: t.expense, profit: t.gross_profit, margin: t.margin_pct, fill: TYPE_META[t.type].color }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto max-w-[1440px] px-6 py-5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl gradient-primary shadow-glow flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">3PL · P&amp;L Аналитика</p>
              <h1 className="text-xl font-semibold tracking-tight">Неделя {week.week} · {week.period}</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-6 py-8 space-y-8">
        {/* === Уровень 1: Общие итоги === */}
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Сводка за неделю</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Итоговые показатели из листа 3PL_weekly · колонка TOTAL</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Выручка"
              value={fmtUSD(week.totals.revenue)}
              hint={<span>{week.parties.length} партий</span>}
              accent="primary"
              icon={<Wallet className="h-5 w-5" />}
            />
            <StatCard
              label="Расходы"
              value={fmtUSD(week.totals.expense)}
              hint={`${fmtPct(week.totals.expense / week.totals.revenue)} от выручки`}
              accent="destructive"
              icon={<Receipt className="h-5 w-5" />}
            />
            <StatCard
              label="Валовая прибыль"
              value={fmtUSD(week.totals.gross_profit)}
              hint={<span className="inline-flex items-center gap-1 text-success"><TrendingUp className="h-3 w-3" />положительная</span>}
              accent="success"
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <StatCard
              label="Маржа"
              value={`${week.totals.margin_pct.toFixed(2)}%`}
              hint="GP / Выручка"
              accent="warning"
              icon={<Percent className="h-5 w-5" />}
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SectionCard title="Структура выручки" description="Распределение по типам бизнеса" className="lg:col-span-1">
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={revenuePie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {revenuePie.map((d, i) => (
                        <Cell key={i} fill={d.fill} stroke="var(--card)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                      formatter={(v: number, n) => [fmtUSD(v), n as string]}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Выручка vs Расходы по типам" description="Сравнение оборота и операционных расходов" className="lg:col-span-2">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={profitBar} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                      formatter={(v: number, n) => [fmtUSD(v), n as string]}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" name="Выручка" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expense" name="Расходы" fill="var(--destructive)" radius={[6, 6, 0, 0]} opacity={0.85} />
                    <Bar dataKey="profit" name="Прибыль" fill="var(--success)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>
        </section>

        {/* === Уровень 2: Разбивка по типам === */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Разбивка по типам бизнеса</h2>
            <p className="text-sm text-muted-foreground mt-0.5">CAINIAO — C2M экспорт. UZUM MPO и UZUM MKO — два независимых направления Crossborder</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {typeBreakdown.map((t) => {
              const meta = TYPE_META[t.type];
              const isHealthy = t.margin_pct >= 15;
              return (
                <div key={t.type} className="rounded-2xl border bg-card p-6 shadow-elegant relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: meta.color }} />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{meta.full}</p>
                    </div>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t.count} партий</span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Выручка</p>
                      <p className="text-base font-semibold tabular-nums mt-0.5">{fmtUSD(t.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Расходы</p>
                      <p className="text-base font-semibold tabular-nums mt-0.5">{fmtUSD(t.expense)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Валовая прибыль</p>
                      <p className={cn("text-base font-semibold tabular-nums mt-0.5", t.gross_profit >= 0 ? "text-success" : "text-destructive")}>{fmtUSD(t.gross_profit)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Маржа</p>
                      <p className={cn("text-base font-semibold tabular-nums mt-0.5 inline-flex items-center gap-1", isHealthy ? "text-success" : "text-warning")}>
                        {isHealthy ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {t.margin_pct.toFixed(2)}%
                      </p>
                    </div>
                  </div>

                  {t.note && (
                    <div className="mt-4 rounded-lg bg-accent/40 border border-accent px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                      ⓘ {t.note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* UZUM CB umbrella */}
          <div className="rounded-2xl border border-dashed bg-muted/30 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Зонтик · UZUM Crossborder</p>
                <p className="text-sm text-foreground mt-0.5">MPO + MKO вместе — для сверки с разделом «UZUM CB» в P&amp;L</p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Выручка</p>
                  <p className="font-semibold tabular-nums">{fmtUSD(week.umbrella_uzum_cb.revenue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Прибыль</p>
                  <p className="font-semibold tabular-nums text-success">{fmtUSD(week.umbrella_uzum_cb.gross_profit)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase text-muted-foreground tracking-wider">Маржа</p>
                  <p className="font-semibold tabular-nums text-success">{week.umbrella_uzum_cb.margin_pct.toFixed(2)}%</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* === Уровень 3: Анализ маркеров === */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Анализ маркеров</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Маркер 1 — тариф линейхолла $/кг (расходы). Маркер 2 — объёмный/нетто. Маркер 3 — брутто/нетто
              </p>
            </div>
            <div className="inline-flex rounded-lg border bg-card p-1 shadow-sm">
              {(["ALL", "CAINIAO", "MPO", "MKO"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    filter === f ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "ALL" ? "Все" : TYPE_META[f].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <MarkerSection
              title="Маркер 1 · Тариф линейхолла"
              description="Стоимость линейного перелёта Китай→хаб на килограмм. Берётся из листа Expenses. Высокий тариф — снижение маржи."
              parties={parties}
              metric="marker1_tariff"
              threshold={THRESHOLDS.marker1}
              decimals={2}
              yLabel="$/кг"
              unit=" $/кг"
            />
            <MarkerSection
              title="Маркер 2 · Объёмный / Нетто"
              description="Соотношение объёмного веса к фактическому. Чем выше — тем «легче» груз и дороже за кг. По UZUM MPO/MKO данные не разнесены в листе Маркеры."
              parties={parties}
              metric="marker2_volnet"
              threshold={THRESHOLDS.marker2}
              decimals={3}
              yLabel="коэф."
              unit="x"
            />
            <MarkerSection
              title="Маркер 3 · Брутто / Нетто"
              description="Отражает «упаковочную» надбавку. Чем выше — тем больше веса уходит на тару."
              parties={parties}
              metric="marker3_grossnet"
              threshold={THRESHOLDS.marker3}
              decimals={3}
              yLabel="коэф."
              unit="x"
            />
          </div>
        </section>

        {/* === Уровень 4: Детальная таблица === */}
        <SectionCard
          title="Детализация по партиям"
          description={`${parties.length} ${parties.length === 1 ? "партия" : "партий"} · сортировка по дате`}
        >
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Партия</th>
                  <th className="px-3 py-3 font-medium">Тип</th>
                  <th className="px-3 py-3 font-medium">Дата</th>
                  <th className="px-3 py-3 font-medium text-right">Выручка</th>
                  <th className="px-3 py-3 font-medium text-right">Расходы</th>
                  <th className="px-3 py-3 font-medium text-right">Прибыль</th>
                  <th className="px-3 py-3 font-medium text-right">Маржа</th>
                  <th className="px-3 py-3 font-medium text-right">M1 $/кг</th>
                  <th className="px-3 py-3 font-medium text-right">M2 vol/net</th>
                  <th className="px-3 py-3 font-medium text-right">M3 g/net</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => {
                  const meta = TYPE_META[p.type];
                  const m1Status = p.marker1_tariff != null ? statusOf(p.marker1_tariff, THRESHOLDS.marker1) : null;
                  const m2Status = p.marker2_volnet != null ? statusOf(p.marker2_volnet, THRESHOLDS.marker2) : null;
                  const m3Status = p.marker3_grossnet != null ? statusOf(p.marker3_grossnet, THRESHOLDS.marker3) : null;
                  const isProfit = p.gross_profit >= 0;
                  return (
                    <tr key={p.col} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3 font-medium tabular-nums">{p.num}</td>
                      <td className="px-3 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: `color-mix(in oklab, ${meta.color} 15%, transparent)`, color: meta.color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground tabular-nums">{p.date ?? "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmtUSD(p.revenue)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{fmtUSD(p.expense)}</td>
                      <td className={cn("px-3 py-3 text-right font-semibold tabular-nums", isProfit ? "text-success" : "text-destructive")}>
                        {fmtUSD(p.gross_profit)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {p.margin_pct != null ? (
                          <span className={cn("font-medium", p.margin_pct >= 15 ? "text-success" : p.margin_pct >= 5 ? "text-warning" : "text-destructive")}>
                            {p.margin_pct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <MarkerCell value={p.marker1_tariff} status={m1Status} decimals={2} suffix="" />
                      <MarkerCell value={p.marker2_volnet} status={m2Status} decimals={3} suffix="x" />
                      <MarkerCell value={p.marker3_grossnet} status={m3Status} decimals={3} suffix="x" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Статусы маркеров:</span>
            <StatusBadge status="ok" />
            <StatusBadge status="warning" />
            <StatusBadge status="critical" />
          </div>
        </SectionCard>

        <footer className="text-center text-xs text-muted-foreground py-4">
          Источник: 3PL_PL_2026 · лист 3PL_weekly (TOTAL колонка) · Маркеры 2-3 · Expenses
        </footer>
      </main>
    </div>
  );
}

function MarkerCell({
  value,
  status,
  decimals,
  suffix,
}: {
  value: number | null;
  status: "ok" | "warning" | "critical" | null;
  decimals: number;
  suffix: string;
}) {
  if (value == null || status == null) {
    return (
      <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">—</td>
    );
  }
  const cls =
    status === "critical"
      ? "text-destructive"
      : status === "warning"
      ? "text-warning"
      : "text-success";
  return (
    <td className={cn("px-3 py-3 text-right font-medium tabular-nums", cls)}>
      {fmtNum(value, decimals)}
      {suffix}
    </td>
  );
}

function MarkerSection({
  title,
  description,
  parties,
  metric,
  threshold,
  decimals,
  yLabel,
  unit,
}: {
  title: string;
  description: string;
  parties: Party[];
  metric: "marker1_tariff" | "marker2_volnet" | "marker3_grossnet";
  threshold: { warning: number; critical: number; direction: "above" | "below"; decimals?: number };
  decimals: number;
  yLabel: string;
  unit: string;
}) {
  const valid = parties.filter((p) => typeof p[metric] === "number" && Number.isFinite(p[metric] as number));
  const total = valid.length;
  const critical = valid.filter((p) => statusOf(p[metric] as number, threshold) === "critical").length;
  const warning = valid.filter((p) => statusOf(p[metric] as number, threshold) === "warning").length;
  const ok = total - critical - warning;
  const avg = total > 0 ? valid.reduce((s, p) => s + (p[metric] as number), 0) / total : 0;
  const max = total > 0 ? Math.max(...valid.map((p) => p[metric] as number)) : 0;
  const min = total > 0 ? Math.min(...valid.map((p) => p[metric] as number)) : 0;

  return (
    <SectionCard title={title} description={description}>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
        <MiniStat label="Партий с данными" value={fmtNum(total)} />
        <MiniStat label="Среднее" value={`${fmtNum(avg, decimals)}${unit}`} accent="primary" />
        <MiniStat label="Минимум" value={`${fmtNum(min, decimals)}${unit}`} />
        <MiniStat label="Максимум" value={`${fmtNum(max, decimals)}${unit}`} />
        <MiniStat label="Внимание" value={fmtNum(warning)} accent="warning" />
        <MiniStat label="Критично" value={fmtNum(critical)} accent="destructive" />
      </div>

      {total > 0 ? (
        <MarkerChart
          parties={valid}
          metric={metric}
          threshold={{ critical: threshold.critical, warning: threshold.warning, direction: threshold.direction, unit }}
          yLabel={yLabel}
          decimals={decimals}
        />
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Для выбранных партий нет данных по этому маркеру
        </div>
      )}

      {/* Status legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">Норма ≤ {fmtNum(threshold.warning, decimals)}{unit}</span>
        <span className="text-warning">Внимание ≥ {fmtNum(threshold.warning, decimals)}{unit}</span>
        <span className="text-destructive">Критично ≥ {fmtNum(threshold.critical, decimals)}{unit}</span>
        <span className="ml-auto text-muted-foreground">{ok} норма · {warning} внимание · {critical} критично</span>
      </div>
    </SectionCard>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: "primary" | "warning" | "destructive" }) {
  const cls =
    accent === "primary"
      ? "text-primary"
      : accent === "warning"
      ? "text-warning"
      : accent === "destructive"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-base font-semibold tabular-nums mt-0.5", cls)}>{value}</p>
    </div>
  );
}

export { Dashboard };
