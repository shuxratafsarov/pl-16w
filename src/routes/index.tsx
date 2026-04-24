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
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  Wallet,
  Receipt,
  Percent,
  AlertTriangle,
  ShieldCheck,
  Flame,
  CheckCircle2,
  LineChart as LineChartIcon,
  Plane,
  PackageCheck,
  Banknote,
  Boxes,
  Calendar,
  type LucideIcon,
} from "lucide-react";
import data from "@/data/week16.json";
import type { Party, PartyType, WeekData } from "@/lib/types";
import { fmtUSD, fmtNum, fmtPct } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { MarkerChart } from "@/components/MarkerChart";
import { ProductMix } from "@/components/ProductMix";
import { DetailDialog, type DetailTarget } from "@/components/DetailDialog";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const week = data as WeekData;

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const TYPE_META: Record<PartyType, { label: string; full: string; color: string; accent: "cainiao" | "mpo" | "mko"; icon: LucideIcon }> = {
  CAINIAO: { label: "CAINIAO", full: "Cainiao C2M · авиа Китай→UZ", color: "var(--cainiao)", accent: "cainiao", icon: Plane },
  MPO: { label: "UZUM MPO", full: "UZUM Crossborder · MPO", color: "var(--mpo)", accent: "mpo", icon: PackageCheck },
  MKO: { label: "UZUM MKO", full: "UZUM Crossborder · MKO", color: "var(--mko)", accent: "mko", icon: Banknote },
};

type MarkerKey = "marker1_tariff" | "marker2_volnet" | "marker3_grossnet";

const MARKER_META: Record<MarkerKey, { title: string; short: string; unit: string; decimals: number; yLabel: string; description: string }> = {
  marker1_tariff: {
    title: "Маркер 1 · Тариф Лайнхолла",
    short: "M1 · Тариф",
    unit: " $/кг",
    decimals: 2,
    yLabel: "$/кг",
    description: "Стоимость линейного перелёта Китай→хаб на килограмм. Берётся из листа Expenses. Высокий тариф снижает маржу.",
  },
  marker2_volnet: {
    title: "Маркер 2 · Объёмный / Нетто",
    short: "M2 · Vol/Net",
    unit: "x",
    decimals: 3,
    yLabel: "коэф.",
    description: "Соотношение объёмного веса к фактическому. Чем выше — тем «легче» груз и дороже за кг.",
  },
  marker3_grossnet: {
    title: "Маркер 3 · Брутто / Нетто",
    short: "M3 · Gross/Net",
    unit: "x",
    decimals: 3,
    yLabel: "коэф.",
    description: "«Упаковочная» надбавка. Чем выше — тем больше веса уходит на тару.",
  },
};

/** Динамические пороги от среднего внутри типа.
 * warning = avg + 10%, critical = avg + 20% (для маркеров где «выше = хуже»)
 */
const WARN_PCT = 0.1;
const CRIT_PCT = 0.2;

/** Кнопки маркеров для шапки (включая M4 без графика-маркера). */
const MARKER_BUTTONS: Array<{ id: string; short: string; title: string; description: string }> = [
  { id: "marker-1", short: "M1", title: "Тариф линейхолла", description: MARKER_META.marker1_tariff.description },
  { id: "marker-2", short: "M2", title: "Объёмный / Нетто", description: MARKER_META.marker2_volnet.description },
  { id: "marker-3", short: "M3", title: "Брутто / Нетто", description: MARKER_META.marker3_grossnet.description },
  { id: "marker-4", short: "M4", title: "Соотношение продуктов", description: "Структура микса по странам и подтипам (RM/SRM/NRM и т. д.) в штуках или килограммах. Показывает, какие категории дают основной объём." },
];

/** Доступные недели (1–16). Даты-периоды для tooltip. */
const WEEKS: Array<{ week: number; period: string }> = [
  { week: 1, period: "2025-12-29 — 2026-01-04" },
  { week: 2, period: "2026-01-05 — 2026-01-11" },
  { week: 3, period: "2026-01-12 — 2026-01-18" },
  { week: 4, period: "2026-01-19 — 2026-01-25" },
  { week: 5, period: "2026-01-26 — 2026-02-01" },
  { week: 6, period: "2026-02-02 — 2026-02-08" },
  { week: 7, period: "2026-02-09 — 2026-02-15" },
  { week: 8, period: "2026-02-16 — 2026-02-22" },
  { week: 9, period: "2026-02-23 — 2026-03-01" },
  { week: 10, period: "2026-03-02 — 2026-03-08" },
  { week: 11, period: "2026-03-09 — 2026-03-15" },
  { week: 12, period: "2026-03-16 — 2026-03-22" },
  { week: 13, period: "2026-03-23 — 2026-03-29" },
  { week: 14, period: "2026-03-30 — 2026-04-05" },
  { week: 15, period: "2026-04-06 — 2026-04-12" },
  { week: 16, period: "2026-04-13 — 2026-04-19" },
];

function scrollToMarker(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

type Status = "ok" | "warning" | "critical";

function statusFromAvg(value: number, avg: number): Status {
  if (avg <= 0) return "ok";
  const ratio = value / avg;
  if (ratio >= 1 + CRIT_PCT) return "critical";
  if (ratio >= 1 + WARN_PCT) return "warning";
  return "ok";
}

/** Считает средние значения маркеров отдельно для каждого типа (только по партиям с данными). */
function computeTypeAverages(parties: Party[]) {
  const result = {} as Record<PartyType, Partial<Record<MarkerKey, number>>>;
  (["CAINIAO", "MPO", "MKO"] as PartyType[]).forEach((t) => {
    result[t] = {};
    (Object.keys(MARKER_META) as MarkerKey[]).forEach((m) => {
      const vals = parties
        .filter((p) => p.type === t && typeof p[m] === "number" && Number.isFinite(p[m] as number))
        .map((p) => p[m] as number);
      if (vals.length > 0) {
        result[t][m] = vals.reduce((s, v) => s + v, 0) / vals.length;
      }
    });
  });
  return result;
}

function Dashboard() {
  const [filter, setFilter] = useState<"ALL" | PartyType>("ALL");
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  const typeAverages = useMemo(() => computeTypeAverages(week.parties), []);

  /** Вычисляем статус каждой партии по каждому маркеру относительно среднего по её типу. */
  const partyStatuses = useMemo(() => {
    const map = new Map<string, Record<MarkerKey, Status | null>>();
    week.parties.forEach((p) => {
      const rec: Record<MarkerKey, Status | null> = {
        marker1_tariff: null,
        marker2_volnet: null,
        marker3_grossnet: null,
      };
      (Object.keys(MARKER_META) as MarkerKey[]).forEach((m) => {
        const v = p[m];
        const avg = typeAverages[p.type]?.[m];
        if (typeof v === "number" && Number.isFinite(v) && typeof avg === "number" && avg > 0) {
          rec[m] = statusFromAvg(v, avg);
        }
      });
      map.set(p.col, rec);
    });
    return map;
  }, [typeAverages]);

  /** Worst-status по партии — для подсветки строк и подсчёта алертов на карточках типов. */
  const worstStatusByParty = useMemo(() => {
    const map = new Map<string, Status>();
    week.parties.forEach((p) => {
      const s = partyStatuses.get(p.col);
      if (!s) return;
      const arr = Object.values(s);
      if (arr.includes("critical")) map.set(p.col, "critical");
      else if (arr.includes("warning")) map.set(p.col, "warning");
      else map.set(p.col, "ok");
    });
    return map;
  }, [partyStatuses]);

  /** Топ-блок «Требует внимания»: все партии с critical или warning, отсортированы по тяжести. */
  const alerts = useMemo(() => {
    const list: Array<{
      party: Party;
      marker: MarkerKey;
      value: number;
      avg: number;
      deviation: number;
      status: Status;
    }> = [];
    week.parties.forEach((p) => {
      const s = partyStatuses.get(p.col);
      if (!s) return;
      (Object.keys(MARKER_META) as MarkerKey[]).forEach((m) => {
        const status = s[m];
        if (status === "warning" || status === "critical") {
          const v = p[m] as number;
          const avg = typeAverages[p.type][m] as number;
          list.push({
            party: p,
            marker: m,
            value: v,
            avg,
            deviation: ((v - avg) / avg) * 100,
            status,
          });
        }
      });
    });
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "critical" ? -1 : 1;
      return b.deviation - a.deviation;
    });
  }, [partyStatuses, typeAverages]);

  const criticalCount = alerts.filter((a) => a.status === "critical").length;
  const warningCount = alerts.filter((a) => a.status === "warning").length;

  /** Подсчёт критических/warning партий по типу — для бейджей на карточках. */
  const typeAlertCounts = useMemo(() => {
    const counts = {} as Record<PartyType, { critical: number; warning: number }>;
    (["CAINIAO", "MPO", "MKO"] as PartyType[]).forEach((t) => {
      counts[t] = { critical: 0, warning: 0 };
    });
    week.parties.forEach((p) => {
      const w = worstStatusByParty.get(p.col);
      if (w === "critical") counts[p.type].critical += 1;
      else if (w === "warning") counts[p.type].warning += 1;
    });
    return counts;
  }, [worstStatusByParty]);

  const parties = useMemo<Party[]>(
    () => (filter === "ALL" ? week.parties : week.parties.filter((p) => p.type === filter)),
    [filter]
  );

  const typeBreakdown = useMemo(
    () =>
      (Object.keys(TYPE_META) as PartyType[])
        .filter((t) => week.byType?.[t] != null)
        .map((t) => ({
          type: t,
          ...week.byType[t],
        })),
    []
  );

  const revenuePie = typeBreakdown.map((t) => ({ name: TYPE_META[t.type].label, value: t.revenue, fill: TYPE_META[t.type].color }));
  const profitBar = typeBreakdown.map((t) => ({ name: TYPE_META[t.type].label, revenue: t.revenue, expense: t.expense, profit: t.gross_profit, margin: t.margin_pct, fill: TYPE_META[t.type].color }));

  return (
    <div className="min-h-screen">
      <TooltipProvider delayDuration={150}>
        {/* Header */}
        <header className="border-b border-border/60 bg-card/40 backdrop-blur-xl sticky top-0 z-30">
          <div className="mx-auto max-w-[1440px] px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-11 w-11 rounded-2xl gradient-primary shadow-glow flex items-center justify-center shrink-0">
                <LineChartIcon className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">3PL · P&amp;L Аналитика</p>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">Неделя {week.week}</h1>
              </div>
            </div>

            {/* Центр: селектор недели + кнопки маркеров */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Week selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs font-semibold hover:bg-muted/60 transition-colors"
                  >
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    Неделя {week.week}
                    <span className="text-muted-foreground font-normal hidden md:inline">· {week.period}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="max-h-[60vh] overflow-y-auto w-56">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Выбрать неделю (наведите для дат)
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {WEEKS.map((w) => {
                    const isCurrent = w.week === week.week;
                    return (
                      <UITooltip key={w.week}>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            disabled={!isCurrent}
                            className={cn(
                              "flex items-center justify-between gap-2 text-xs cursor-pointer",
                              isCurrent && "bg-primary/10 text-primary font-semibold"
                            )}
                          >
                            <span>Неделя {w.week}</span>
                            {isCurrent ? (
                              <span className="text-[10px] uppercase">текущая</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">нет данных</span>
                            )}
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                          {w.period}
                        </TooltipContent>
                      </UITooltip>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Marker quick-jump buttons */}
              <div className="inline-flex rounded-xl border border-border/60 bg-card/60 p-1 gap-0.5">
                {MARKER_BUTTONS.map((b) => (
                  <UITooltip key={b.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => scrollToMarker(b.id)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-primary/15 transition-colors tabular-nums"
                      >
                        {b.short}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
                      <p className="font-semibold mb-0.5">{b.short} · {b.title}</p>
                      <p className="opacity-90">{b.description}</p>
                    </TooltipContent>
                  </UITooltip>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {(criticalCount > 0 || warningCount > 0) && (
                <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs">
                  {criticalCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-destructive font-semibold">
                      <Flame className="h-3.5 w-3.5" /> {criticalCount} критич.
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-warning font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" /> {warningCount} внимание
                    </span>
                  )}
                </div>
              )}
              <ThemeToggle />
            </div>
          </div>
        </header>
      </TooltipProvider>

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
              onClick={() => setDetail({ kind: "kpi", metric: "revenue" })}
            />
            <StatCard
              label="Расходы"
              value={fmtUSD(week.totals.expense)}
              hint={`${fmtPct(week.totals.expense / week.totals.revenue)} от выручки`}
              accent="destructive"
              icon={<Receipt className="h-5 w-5" />}
              onClick={() => setDetail({ kind: "kpi", metric: "expense" })}
            />
            <StatCard
              label="Валовая прибыль"
              value={fmtUSD(week.totals.gross_profit)}
              hint={<span className="inline-flex items-center gap-1 text-success"><TrendingUp className="h-3 w-3" />положительная</span>}
              accent="success"
              icon={<TrendingUp className="h-5 w-5" />}
              onClick={() => setDetail({ kind: "kpi", metric: "gross_profit" })}
            />
            <StatCard
              label="Маржа"
              value={`${week.totals.margin_pct.toFixed(2)}%`}
              hint="GP / Выручка"
              accent="warning"
              icon={<Percent className="h-5 w-5" />}
              onClick={() => setDetail({ kind: "kpi", metric: "margin" })}
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

        {/* === Топ-блок: Требует внимания === */}
        <AlertsPanel alerts={alerts} criticalCount={criticalCount} warningCount={warningCount} />

        {/* === Уровень 2: Разбивка по типам === */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Разбивка по типам бизнеса</h2>
            <p className="text-sm text-muted-foreground mt-0.5">CAINIAO — C2M экспорт. UZUM MPO и UZUM MKO — два независимых направления Crossborder</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {typeBreakdown.map((t) => {
              const meta = TYPE_META[t.type];
              const TypeIcon = meta.icon;
              const isHealthy = t.margin_pct >= 15;
              const counts = typeAlertCounts[t.type];
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => setDetail({ kind: "type", type: t.type })}
                  className="group relative overflow-hidden rounded-2xl glass-card p-6 shadow-elegant transition-all duration-300 hover:shadow-elevated hover:-translate-y-0.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {/* glow accent */}
                  <div
                    className="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-30 blur-3xl"
                    style={{ backgroundColor: meta.color }}
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-glow"
                        style={{ backgroundColor: meta.color }}
                      >
                        <TypeIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{meta.full}</p>
                      </div>
                    </div>
                    <span className="rounded-md bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">{t.count} партий</span>
                  </div>

                  {/* Alert badges */}
                  {(counts.critical > 0 || counts.warning > 0) && (
                    <div className="relative mt-4 flex flex-wrap gap-2">
                      {counts.critical > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md gradient-danger px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                          <Flame className="h-3 w-3" /> {counts.critical} критич.
                        </span>
                      )}
                      {counts.warning > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md gradient-warn px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                          <AlertTriangle className="h-3 w-3" /> {counts.warning} внимание
                        </span>
                      )}
                    </div>
                  )}
                  {counts.critical === 0 && counts.warning === 0 && (
                    <div className="relative mt-4">
                      <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                        <ShieldCheck className="h-3 w-3" /> все маркеры в норме
                      </span>
                    </div>
                  )}

                  <div className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Выручка</p>
                      <p className="text-base font-bold tabular-nums mt-0.5">{fmtUSD(t.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Расходы</p>
                      <p className="text-base font-bold tabular-nums mt-0.5">{fmtUSD(t.expense)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Прибыль</p>
                      <p className={cn("text-base font-bold tabular-nums mt-0.5", t.gross_profit >= 0 ? "text-success" : "text-destructive")}>{fmtUSD(t.gross_profit)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Маржа</p>
                      <p className={cn("text-base font-bold tabular-nums mt-0.5 inline-flex items-center gap-1", isHealthy ? "text-success" : "text-warning")}>
                        {isHealthy ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {t.margin_pct.toFixed(2)}%
                      </p>
                    </div>
                  </div>

                  {t.note && (
                    <div className="relative mt-4 rounded-lg bg-accent/30 border border-accent/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                      ⓘ {t.note}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* UZUM CB umbrella */}
          <div className="rounded-2xl border border-dashed border-border bg-card/40 backdrop-blur-sm p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted/60 border border-border flex items-center justify-center text-muted-foreground">
                  <Boxes className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Зонтик · UZUM Crossborder</p>
                  <p className="text-sm text-foreground mt-0.5">MPO + MKO вместе — для сверки с разделом «UZUM CB» в P&amp;L</p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Выручка</p>
                  <p className="font-bold tabular-nums">{fmtUSD(week.umbrella_uzum_cb.revenue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Прибыль</p>
                  <p className="font-bold tabular-nums text-success">{fmtUSD(week.umbrella_uzum_cb.gross_profit)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Маржа</p>
                  <p className="font-bold tabular-nums text-success">{week.umbrella_uzum_cb.margin_pct.toFixed(2)}%</p>
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
                Пороги считаются от среднего значения внутри типа: <span className="text-warning font-medium">внимание ≥ +10%</span>, <span className="text-destructive font-medium">критично ≥ +20%</span>
              </p>
            </div>
            <div className="inline-flex rounded-xl border border-border bg-card/60 backdrop-blur-sm p-1 shadow-sm">
              {(["ALL", "CAINIAO", "MPO", "MKO"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                    filter === f ? "gradient-primary text-white shadow-glow" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "ALL" ? "Все" : TYPE_META[f].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {(Object.keys(MARKER_META) as MarkerKey[]).map((m, i) => (
              <div key={m} id={`marker-${i + 1}`} className="scroll-mt-24">
                <MarkerSection
                  metric={m}
                  parties={parties}
                  allParties={week.parties}
                  typeAverages={typeAverages}
                  partyStatuses={partyStatuses}
                />
              </div>
            ))}

            {/* Маркер 4 — Соотношение продуктов (шт / кг) */}
            <SectionCard
              id="marker-4"
              title="Маркер 4 · Соотношение продуктов"
              description={
                filter === "ALL"
                  ? "Микс по странам и подтипам — все направления"
                  : `Микс по странам и подтипам — ${TYPE_META[filter].label}`
              }
            >
              <ProductMix
                parties={parties}
                scope={filter === "ALL" ? { kind: "all" } : { kind: "type", type: filter }}
              />
            </SectionCard>
          </div>
        </section>

        {/* === Уровень 4: Детальная таблица === */}
        <SectionCard
          title="Детализация по партиям"
          description={`${parties.length} ${parties.length === 1 ? "партия" : "партий"} · подсветка строк по worst-маркеру`}
        >
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Партия</th>
                  <th className="px-3 py-3 font-semibold">Тип</th>
                  <th className="px-3 py-3 font-semibold">Дата</th>
                  <th className="px-3 py-3 font-semibold text-right">Выручка</th>
                  <th className="px-3 py-3 font-semibold text-right">Расходы</th>
                  <th className="px-3 py-3 font-semibold text-right">Прибыль</th>
                  <th className="px-3 py-3 font-semibold text-right">Маржа</th>
                  <th className="px-3 py-3 font-semibold text-right">M1 $/кг</th>
                  <th className="px-3 py-3 font-semibold text-right">M2 vol/net</th>
                  <th className="px-3 py-3 font-semibold text-right">M3 g/net</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => {
                  const meta = TYPE_META[p.type];
                  const statuses = partyStatuses.get(p.col) ?? { marker1_tariff: null, marker2_volnet: null, marker3_grossnet: null };
                  const worst = worstStatusByParty.get(p.col) ?? "ok";
                  const isProfit = p.gross_profit >= 0;
                  return (
                    <tr
                      key={p.col}
                      onClick={() => setDetail({ kind: "party", col: p.col })}
                      className={cn(
                        "border-b border-border/50 transition-colors cursor-pointer",
                        worst === "critical" && "row-critical",
                        worst === "warning" && "row-warning",
                        worst === "ok" && "hover:bg-muted/30"
                      )}
                    >
                      <td className="px-3 py-3 font-semibold tabular-nums">
                        <div className="flex items-center gap-2">
                          {worst === "critical" && <Flame className="h-3.5 w-3.5 text-destructive shrink-0" />}
                          {worst === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />}
                          {p.num}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold"
                          style={{ backgroundColor: `color-mix(in oklab, ${meta.color} 18%, transparent)`, color: meta.color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground tabular-nums">{p.date ?? "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmtUSD(p.revenue)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{fmtUSD(p.expense)}</td>
                      <td className={cn("px-3 py-3 text-right font-bold tabular-nums", isProfit ? "text-success" : "text-destructive")}>
                        {fmtUSD(p.gross_profit)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {p.margin_pct != null ? (
                          <span className={cn("font-semibold", p.margin_pct >= 15 ? "text-success" : p.margin_pct >= 5 ? "text-warning" : "text-destructive")}>
                            {p.margin_pct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <MarkerCell value={p.marker1_tariff} status={statuses.marker1_tariff} avg={typeAverages[p.type].marker1_tariff} decimals={2} suffix="" />
                      <MarkerCell value={p.marker2_volnet} status={statuses.marker2_volnet} avg={typeAverages[p.type].marker2_volnet} decimals={3} suffix="x" />
                      <MarkerCell value={p.marker3_grossnet} status={statuses.marker3_grossnet} avg={typeAverages[p.type].marker3_grossnet} decimals={3} suffix="x" />
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
            <span className="ml-auto">Подсветка строки = worst-статус среди M1/M2/M3</span>
          </div>
        </SectionCard>

        <footer className="text-center text-xs text-muted-foreground py-4">
          Источник: 3PL_PL_2026 · лист 3PL_weekly (TOTAL колонка) · Маркеры 2-3 · Expenses
        </footer>
      </main>

      <DetailDialog
        target={detail}
        week={week}
        onOpenChange={(open) => !open && setDetail(null)}
        onSelectParty={(col) => setDetail({ kind: "party", col })}
      />
    </div>
  );
}

/* === Алерты вверху === */
function AlertsPanel({
  alerts,
  criticalCount,
  warningCount,
}: {
  alerts: Array<{ party: Party; marker: MarkerKey; value: number; avg: number; deviation: number; status: Status }>;
  criticalCount: number;
  warningCount: number;
}) {
  if (alerts.length === 0) {
    return (
      <section className="rounded-2xl glass-card p-6 shadow-elegant">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl gradient-success flex items-center justify-center text-white shadow-glow">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Все маркеры в норме</h3>
            <p className="text-sm text-muted-foreground">Ни одна партия не превышает порог +10% от среднего по своему типу</p>
          </div>
        </div>
      </section>
    );
  }

  const critical = alerts.filter((a) => a.status === "critical");
  const warning = alerts.filter((a) => a.status === "warning");

  return (
    <section className="rounded-2xl glass-card p-6 shadow-elegant">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl gradient-danger flex items-center justify-center text-white shadow-glow">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Требует внимания</h3>
            <p className="text-sm text-muted-foreground">
              Партии с отклонением выше нормы (от среднего по своему типу)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg gradient-danger px-3 py-1.5 font-semibold text-white shadow-sm">
              <Flame className="h-3.5 w-3.5" /> {criticalCount} критич.
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg gradient-warn px-3 py-1.5 font-semibold text-white shadow-sm">
              <AlertTriangle className="h-3.5 w-3.5" /> {warningCount} внимание
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[...critical, ...warning].slice(0, 8).map((a, i) => {
          const meta = TYPE_META[a.party.type];
          const m = MARKER_META[a.marker];
          return (
            <div
              key={i}
              className={cn(
                "rounded-xl border px-4 py-3 transition-colors",
                a.status === "critical" ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: `color-mix(in oklab, ${meta.color} 20%, transparent)`, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-sm font-bold tabular-nums">№{a.party.num}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs font-medium text-muted-foreground">{m.short}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Значение <span className="font-bold text-foreground tabular-nums">{fmtNum(a.value, m.decimals)}{m.unit}</span>
                    {" "}при среднем по типу <span className="tabular-nums">{fmtNum(a.avg, m.decimals)}{m.unit}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn("text-lg font-bold tabular-nums leading-none", a.status === "critical" ? "text-destructive" : "text-warning")}>
                    +{a.deviation.toFixed(1)}%
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">от средн.</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {alerts.length > 8 && (
        <p className="mt-3 text-xs text-muted-foreground text-center">…и ещё {alerts.length - 8}. См. таблицу ниже.</p>
      )}
    </section>
  );
}

/* === Ячейка маркера в таблице === */
function MarkerCell({
  value,
  status,
  avg,
  decimals,
  suffix,
}: {
  value: number | null;
  status: Status | null;
  avg: number | undefined;
  decimals: number;
  suffix: string;
}) {
  if (value == null || status == null) {
    return <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">—</td>;
  }
  const cls =
    status === "critical"
      ? "cell-critical text-destructive font-bold"
      : status === "warning"
      ? "cell-warning text-warning font-semibold"
      : "text-foreground";
  const dev = avg && avg > 0 ? ((value - avg) / avg) * 100 : null;
  return (
    <td className={cn("px-3 py-3 text-right tabular-nums", cls)}>
      <div className="flex flex-col items-end leading-tight">
        <span>
          {fmtNum(value, decimals)}
          {suffix}
        </span>
        {dev != null && (status === "warning" || status === "critical") && (
          <span className="text-[10px] font-medium opacity-75">+{dev.toFixed(1)}%</span>
        )}
      </div>
    </td>
  );
}

/* === Секция маркера === */
function MarkerSection({
  metric,
  parties,
  allParties,
  typeAverages,
  partyStatuses,
}: {
  metric: MarkerKey;
  parties: Party[];
  allParties: Party[];
  typeAverages: Record<PartyType, Partial<Record<MarkerKey, number>>>;
  partyStatuses: Map<string, Record<MarkerKey, Status | null>>;
}) {
  const meta = MARKER_META[metric];
  const valid = parties.filter((p) => typeof p[metric] === "number" && Number.isFinite(p[metric] as number));
  const total = valid.length;

  const critical = valid.filter((p) => partyStatuses.get(p.col)?.[metric] === "critical").length;
  const warning = valid.filter((p) => partyStatuses.get(p.col)?.[metric] === "warning").length;
  const ok = total - critical - warning;

  const avg = total > 0 ? valid.reduce((s, p) => s + (p[metric] as number), 0) / total : 0;
  const max = total > 0 ? Math.max(...valid.map((p) => p[metric] as number)) : 0;
  const min = total > 0 ? Math.min(...valid.map((p) => p[metric] as number)) : 0;

  // Для графика — пороги от среднего по выборке
  const warnThr = avg * (1 + WARN_PCT);
  const critThr = avg * (1 + CRIT_PCT);

  return (
    <SectionCard title={meta.title} description={meta.description}>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
        <MiniStat label="Партий с данными" value={fmtNum(total)} />
        <MiniStat label="Среднее" value={`${fmtNum(avg, meta.decimals)}${meta.unit}`} accent="primary" />
        <MiniStat label="Минимум" value={`${fmtNum(min, meta.decimals)}${meta.unit}`} />
        <MiniStat label="Максимум" value={`${fmtNum(max, meta.decimals)}${meta.unit}`} />
        <MiniStat label="Внимание" value={fmtNum(warning)} accent="warning" />
        <MiniStat label="Критично" value={fmtNum(critical)} accent="destructive" />
      </div>

      {total > 0 ? (
        <MarkerChart
          parties={valid}
          metric={metric}
          threshold={{ critical: critThr, warning: warnThr, direction: "above", unit: meta.unit }}
          yLabel={meta.yLabel}
          decimals={meta.decimals}
        />
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Для выбранных партий нет данных по этому маркеру
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          Норма ≤ <span className="font-semibold text-foreground tabular-nums">{fmtNum(warnThr, meta.decimals)}{meta.unit}</span>
        </span>
        <span className="text-warning">
          Внимание ≥ <span className="font-semibold tabular-nums">{fmtNum(warnThr, meta.decimals)}{meta.unit}</span> (+10%)
        </span>
        <span className="text-destructive">
          Критично ≥ <span className="font-semibold tabular-nums">{fmtNum(critThr, meta.decimals)}{meta.unit}</span> (+20%)
        </span>
        <span className="ml-auto text-muted-foreground">{ok} норма · {warning} внимание · {critical} критично</span>
      </div>

      {/* Подсказка про средние по типам */}
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {(["CAINIAO", "MPO", "MKO"] as PartyType[]).map((t) => {
          const a = typeAverages[t]?.[metric];
          if (a == null) return null;
          const cnt = allParties.filter((p) => p.type === t && typeof p[metric] === "number").length;
          return (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `var(--${t.toLowerCase()})` }} />
              <span className="font-semibold" style={{ color: `var(--${t.toLowerCase()})` }}>{TYPE_META[t].label}</span>
              <span>средн. <span className="font-semibold text-foreground tabular-nums">{fmtNum(a, meta.decimals)}{meta.unit}</span></span>
              <span className="text-muted-foreground">· {cnt} парт.</span>
            </span>
          );
        })}
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
    <div className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/60">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={cn("text-base font-bold tabular-nums mt-0.5", cls)}>{value}</p>
    </div>
  );
}

export { Dashboard };
