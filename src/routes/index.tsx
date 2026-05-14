import { createFileRoute, Link } from "@tanstack/react-router";
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
  Info,
  Lock,
  type LucideIcon,
} from "lucide-react";
import type { Party, PartyType, WeekData } from "@/lib/types";
import { fmtUSD, fmtNum, fmtPct, partyLabel } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { MarkerChart } from "@/components/MarkerChart";
import { MARKER_BASELINE, MARKER_CRITICAL } from "@/lib/markerBaselines";
import { ProductMix } from "@/components/ProductMix";
import { DetailDialog, type DetailTarget } from "@/components/DetailDialog";
import { OverviewAnalytics } from "@/components/OverviewAnalytics";
import { MonthlyView } from "@/components/MonthlyView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

// Загружаем все недели из src/data/week*.json (eager — запекаются в бандл, фолбэк если БД пуста).
const WEEK_MODULES = import.meta.glob("@/data/week*.json", { eager: true, import: "default" }) as Record<string, WeekData>;
const JSON_WEEKS: Record<number, WeekData> = {};
for (const path in WEEK_MODULES) {
  const m = path.match(/week(\d+)\.json$/);
  if (m) JSON_WEEKS[Number(m[1])] = WEEK_MODULES[path];
}
// ALL_WEEKS будет переопределён хуком useDbWeeks ниже; на старте — JSON.
const ALL_WEEKS: Record<number, WeekData> = { ...JSON_WEEKS };
const AVAILABLE_WEEKS = Object.keys(ALL_WEEKS).map(Number).sort((a, b) => a - b);
const DEFAULT_WEEK = AVAILABLE_WEEKS[AVAILABLE_WEEKS.length - 1] ?? 16;
/** Сентинел: «Общий свод» = агрегат по всем неделям. */
const OVERVIEW_KEY = 0;

/** Собирает синтетический WeekData по всем неделям: все партии «склеены», агрегаты пересчитаются дальше через reconcileWeek. */
function buildOverview(weeks: Record<number, WeekData>): WeekData {
  const list = Object.keys(weeks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => weeks[n]);
  if (list.length === 0) {
    return {
      week: OVERVIEW_KEY,
      period: "Общий свод · нет данных",
      totals: { revenue: 0, expense: 0, gross_profit: 0, margin_pct: 0 },
      byType: {
        CAINIAO: { count: 0, revenue: 0, expense: 0, gross_profit: 0, margin_pct: 0 },
        MPO: { count: 0, revenue: 0, expense: 0, gross_profit: 0, margin_pct: 0 },
        MKO: { count: 0, revenue: 0, expense: 0, gross_profit: 0, margin_pct: 0 },
      },
      umbrella_uzum_cb: { revenue: 0, expense: 0, gross_profit: 0, margin_pct: 0 },
      parties: [],
    };
  }
  // Период: от начала первой до конца последней недели
  const firstP = list[0].period.split("—")[0]?.trim() ?? "";
  const lastP = list[list.length - 1].period.split("—")[1]?.trim() ?? "";
  const period = `${firstP} — ${lastP}`;

  // Склеиваем партии. col делаем уникальным: w{N}-{col}, чтобы карты по col не конфликтовали.
  const parties: Party[] = list.flatMap((w) =>
    w.parties.map((p) => ({
      ...p,
      col: `w${w.week}-${p.col}`,
      num: `W${w.week} · ${p.num}${p.type === "MKO" && p.is_auto ? " (А)" : ""}`,
    }))
  );

  // Пустые агрегаты (reconcileWeek пересчитает из parties).
  const emptyAgg = { count: 0, revenue: 0, expense: 0, gross_profit: 0, margin_pct: 0 };
  return {
    week: OVERVIEW_KEY,
    period,
    totals: { revenue: 0, expense: 0, gross_profit: 0, margin_pct: 0 },
    byType: {
      CAINIAO: { ...emptyAgg },
      MPO: { ...emptyAgg },
      MKO: { ...emptyAgg },
    },
    umbrella_uzum_cb: { revenue: 0, expense: 0, gross_profit: 0, margin_pct: 0 },
    parties,
  };
}
const OVERVIEW_WEEK: WeekData = buildOverview(ALL_WEEKS);

/** Расхождение по одной строке (до пересчёта). */
type Discrepancy = {
  scope: string;
  metric: "Выручка" | "Расходы" | "Прибыль";
  source: number;
  computed: number;
  diff: number;
};

/** Пересчёт агрегатов из истины-источника (партий) + сбор расхождений с тем, что было в JSON. */
function reconcileWeek(src: WeekData): { week: WeekData; discrepancies: Discrepancy[] } {
  const EPS = 0.5;
  const discrepancies: Discrepancy[] = [];

  const sumByType = (t: PartyType) => {
    const ps = src.parties.filter((p) => p.type === t);
    const r = ps.reduce((s, p) => s + (p.revenue ?? 0), 0);
    const e = ps.reduce((s, p) => s + (p.expense ?? 0), 0);
    const g = ps.reduce((s, p) => s + (p.gross_profit ?? 0), 0);
    return { count: ps.length, revenue: r, expense: e, gross_profit: g, margin_pct: r > 0 ? (g / r) * 100 : 0 };
  };

  const newByType = {} as Record<PartyType, ReturnType<typeof sumByType> & { note?: string }>;
  (["CAINIAO", "MPO", "MKO"] as PartyType[]).forEach((t) => {
    const c = sumByType(t);
    const old = src.byType[t];
    // Если в исходнике агрегаты по типу пустые (как в Общем своде) — сверять не с чем.
    const oldHas = old && (old.revenue || old.expense || old.gross_profit);
    if (old && oldHas) {
      if (Math.abs(c.revenue - old.revenue) > EPS)
        discrepancies.push({ scope: t, metric: "Выручка", source: old.revenue, computed: c.revenue, diff: c.revenue - old.revenue });
      if (Math.abs(c.expense - old.expense) > EPS)
        discrepancies.push({ scope: t, metric: "Расходы", source: old.expense, computed: c.expense, diff: c.expense - old.expense });
      if (Math.abs(c.gross_profit - old.gross_profit) > EPS)
        discrepancies.push({ scope: t, metric: "Прибыль", source: old.gross_profit, computed: c.gross_profit, diff: c.gross_profit - old.gross_profit });
    }
    newByType[t] = { ...c, note: old?.note };
  });

  const tRev = newByType.CAINIAO.revenue + newByType.MPO.revenue + newByType.MKO.revenue;
  const tExp = newByType.CAINIAO.expense + newByType.MPO.expense + newByType.MKO.expense;
  const tGp = newByType.CAINIAO.gross_profit + newByType.MPO.gross_profit + newByType.MKO.gross_profit;
  const totHas = src.totals.revenue || src.totals.expense || src.totals.gross_profit;
  if (totHas) {
    if (Math.abs(tRev - src.totals.revenue) > EPS)
      discrepancies.push({ scope: "TOTAL", metric: "Выручка", source: src.totals.revenue, computed: tRev, diff: tRev - src.totals.revenue });
    if (Math.abs(tExp - src.totals.expense) > EPS)
      discrepancies.push({ scope: "TOTAL", metric: "Расходы", source: src.totals.expense, computed: tExp, diff: tExp - src.totals.expense });
    if (Math.abs(tGp - src.totals.gross_profit) > EPS)
      discrepancies.push({ scope: "TOTAL", metric: "Прибыль", source: src.totals.gross_profit, computed: tGp, diff: tGp - src.totals.gross_profit });
  }

  const uRev = newByType.MPO.revenue + newByType.MKO.revenue;
  const uExp = newByType.MPO.expense + newByType.MKO.expense;
  const uGp = newByType.MPO.gross_profit + newByType.MKO.gross_profit;
  const oldU = src.umbrella_uzum_cb;
  const uHas = oldU && (oldU.revenue || oldU.expense || oldU.gross_profit);
  if (uHas) {
    if (Math.abs(uRev - oldU.revenue) > EPS)
      discrepancies.push({ scope: "UZUM CB", metric: "Выручка", source: oldU.revenue, computed: uRev, diff: uRev - oldU.revenue });
    if (Math.abs(uExp - oldU.expense) > EPS)
      discrepancies.push({ scope: "UZUM CB", metric: "Расходы", source: oldU.expense, computed: uExp, diff: uExp - oldU.expense });
    if (Math.abs(uGp - oldU.gross_profit) > EPS)
      discrepancies.push({ scope: "UZUM CB", metric: "Прибыль", source: oldU.gross_profit, computed: uGp, diff: uGp - oldU.gross_profit });
  }

  const reconciled: WeekData = {
    ...src,
    totals: { revenue: tRev, expense: tExp, gross_profit: tGp, margin_pct: tRev > 0 ? (tGp / tRev) * 100 : 0 },
    byType: newByType as WeekData["byType"],
    umbrella_uzum_cb: { revenue: uRev, expense: uExp, gross_profit: uGp, margin_pct: uRev > 0 ? (uGp / uRev) * 100 : 0 },
  };

  return { week: reconciled, discrepancies };
}


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
  { id: "marker-1", short: "M1", title: "Тариф Лайнхолла", description: MARKER_META.marker1_tariff.description },
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
  { week: 17, period: "2026-04-20 — 2026-04-26" },
  { week: 18, period: "2026-04-27 — 2026-05-03" },
  { week: 19, period: "2026-05-04 — 2026-05-10" },
];

function scrollToMarker(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

type Status = "ok" | "warning" | "critical";

function statusFromAvg(value: number, avg: number, metric?: MarkerKey): Status {
  // Если у маркера задан фиксированный baseline — используем его + критический порог
  if (metric) {
    const baseline = MARKER_BASELINE[metric];
    const critical = MARKER_CRITICAL[metric];
    if (typeof baseline === "number") {
      if (typeof critical === "number" && value > critical) return "critical";
      if (value > baseline) return typeof critical === "number" && value > critical ? "critical" : "warning";
      return "ok";
    }
  }
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
  const [selectedWeek, setSelectedWeek] = useState<number>(DEFAULT_WEEK);
  const [filter, setFilter] = useState<"ALL" | "UZUM" | PartyType>("ALL");
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  const isOverview = selectedWeek === OVERVIEW_KEY;
  const { week, discrepancies: SOURCE_DISCREPANCIES } = useMemo(() => {
    const raw = isOverview ? OVERVIEW_WEEK : ALL_WEEKS[selectedWeek];
    return reconcileWeek(raw);
  }, [selectedWeek, isOverview]);

  const typeAverages = useMemo(() => computeTypeAverages(week.parties), [week]);

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
          rec[m] = statusFromAvg(v, avg, m);
        }
      });
      map.set(p.col, rec);
    });
    return map;
  }, [typeAverages, week]);

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
  }, [partyStatuses, week]);

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
  }, [partyStatuses, typeAverages, week]);

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
  }, [worstStatusByParty, week]);

  const parties = useMemo<Party[]>(
    () =>
      filter === "ALL"
        ? week.parties
        : filter === "UZUM"
        ? week.parties.filter((p) => p.type === "MKO" || p.type === "MPO")
        : week.parties.filter((p) => p.type === filter),
    [filter, week]
  );

  const typeBreakdown = useMemo(
    () =>
      (Object.keys(TYPE_META) as PartyType[])
        .filter((t) => week.byType?.[t] != null)
        .map((t) => ({
          type: t,
          ...week.byType[t],
        })),
    [week]
  );

  const revenuePie = typeBreakdown.map((t) => ({ name: TYPE_META[t.type].label, value: t.revenue, fill: TYPE_META[t.type].color }));
  const profitBar = typeBreakdown.map((t) => ({ name: TYPE_META[t.type].label, revenue: t.revenue, expense: t.expense, profit: t.gross_profit, margin: t.margin_pct, fill: TYPE_META[t.type].color }));

  /** Сверка с источником: расхождения собраны при reconcileWeek().
   *  После пересчёта в шапке отображаются суммы из партий, поэтому здесь — те расхождения,
   *  которые были обнаружены в исходном листе (и автоматически исправлены). */
  const sourceMatch = useMemo(() => {
    return { ok: SOURCE_DISCREPANCIES.length === 0, issues: SOURCE_DISCREPANCIES };
  }, [SOURCE_DISCREPANCIES]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen">
        {/* Header */}
        <header className="border-b border-border/40 bg-gradient-to-b from-card/80 to-card/50 backdrop-blur-2xl sticky top-0 z-30 shadow-[0_1px_0_0_hsl(var(--border)/0.4),0_8px_24px_-12px_hsl(var(--primary)/0.12)]">
          <div className="mx-auto max-w-[1440px] px-6 h-16 flex items-center gap-3">
            {/* Brand */}
            <div className="flex items-center gap-3 min-w-0 shrink-0">
              <div className="relative h-10 w-10 rounded-2xl gradient-primary shadow-glow flex items-center justify-center ring-1 ring-white/20">
                <LineChartIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                <span className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/0 via-white/15 to-white/0 pointer-events-none" />
              </div>
              <div className="hidden lg:flex flex-col leading-none min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">3PL · P&amp;L</span>
                <span className="text-[15px] font-bold tracking-tight truncate mt-1 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  {isOverview ? `Общий свод` : `Неделя ${week.week}`}
                </span>
              </div>
            </div>

            <div className="h-7 w-px bg-gradient-to-b from-transparent via-border to-transparent hidden lg:block mx-1" />

            {/* Week selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group inline-flex items-center gap-2 h-10 rounded-xl border border-border/60 bg-card/70 px-3.5 text-sm font-semibold hover:bg-muted/70 hover:border-border transition-all shrink-0 shadow-sm"
                >
                  <Calendar className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate max-w-[160px]">{isOverview ? `Общий свод` : `Неделя ${week.week}`}</span>
                  <span className="text-muted-foreground text-xs font-normal opacity-60 group-hover:opacity-100 transition-opacity">▾</span>
                </button>
              </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="max-h-[60vh] overflow-y-auto w-56">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Выбрать неделю (наведите для дат)
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setSelectedWeek(OVERVIEW_KEY)}
                    className={cn(
                      "flex items-center justify-between gap-2 text-xs cursor-pointer",
                      isOverview && "bg-primary/10 text-primary font-semibold"
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Boxes className="h-3.5 w-3.5" />
                      Общий свод
                    </span>
                    {isOverview ? (
                      <span className="text-[10px] uppercase">текущий</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">все недели</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {WEEKS.map((w) => {
                    const isCurrent = !isOverview && w.week === week.week;
                    const hasData = AVAILABLE_WEEKS.includes(w.week);
                    return (
                      <UITooltip key={w.week}>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            disabled={!hasData}
                            onSelect={() => hasData && setSelectedWeek(w.week)}
                            className={cn(
                              "flex items-center justify-between gap-2 text-xs cursor-pointer",
                              isCurrent && "bg-primary/10 text-primary font-semibold"
                            )}
                          >
                            <span>Неделя {w.week}</span>
                            {isCurrent ? (
                              <span className="text-[10px] uppercase">текущая</span>
                            ) : hasData ? (
                              <span className="text-[10px] text-muted-foreground">открыть</span>
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
            <div className="hidden md:inline-flex h-9 items-center rounded-lg border border-border/60 bg-card/60 px-1 gap-0.5 shrink-0">
              {MARKER_BUTTONS.map((b) => (
                <UITooltip key={b.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => scrollToMarker(b.id)}
                      className="px-2 h-7 rounded-md text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-primary/15 transition-colors tabular-nums"
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

            {/* Right cluster */}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {/* Source match indicator */}
              <UITooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 h-9 rounded-lg border px-2.5 text-xs font-semibold transition-colors cursor-help",
                      sourceMatch.ok
                        ? "border-success/40 bg-success/10 text-success hover:bg-success/15"
                        : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15"
                    )}
                  >
                    {sourceMatch.ok ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span className="hidden xl:inline">100% соответствие</span>
                        <span className="xl:hidden">100%</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span className="hidden xl:inline">Авто-сверено · {sourceMatch.issues.length}</span>
                        <span className="xl:hidden">{sourceMatch.issues.length}</span>
                      </>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-md text-xs leading-snug p-0 overflow-hidden">
                  {sourceMatch.ok ? (
                    <div className="p-3">
                      <p className="font-semibold mb-0.5 text-success inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Сверка с источником ✓
                      </p>
                      <p className="opacity-90 mt-0.5">
                        Σ по партиям полностью совпадает с TOTAL и разбивкой по CAINIAO/MPO/MKO в исходном листе 3PL_weekly.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="px-3 pt-3 pb-2">
                        <p className="font-semibold inline-flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5 text-success" /> Авто-сверено с партиями
                        </p>
                        <p className="opacity-80 mt-1 text-[11px] leading-snug">
                          В исходном листе обнаружено <span className="font-semibold text-warning">{sourceMatch.issues.length}</span> расхождений.
                          Дашборд показывает суммы, пересчитанные из партий — это всегда 100% совпадение.
                        </p>
                      </div>
                      <div className="border-t border-border/60 bg-muted/30 max-h-60 overflow-y-auto">
                        <table className="w-full text-[11px] tabular-nums">
                          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                            <tr className="text-left text-muted-foreground">
                              <th className="px-3 py-1.5 font-semibold">Раздел</th>
                              <th className="px-2 py-1.5 font-semibold">Метрика</th>
                              <th className="px-2 py-1.5 font-semibold text-right">В листе</th>
                              <th className="px-2 py-1.5 font-semibold text-right">По партиям</th>
                              <th className="px-3 py-1.5 font-semibold text-right">Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sourceMatch.issues.map((d, i) => (
                              <tr key={i} className="border-t border-border/40">
                                <td className="px-3 py-1.5 font-semibold">{d.scope}</td>
                                <td className="px-2 py-1.5 text-muted-foreground">{d.metric}</td>
                                <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtUSD(d.source)}</td>
                                <td className="px-2 py-1.5 text-right font-semibold">{fmtUSD(d.computed)}</td>
                                <td className={cn(
                                  "px-3 py-1.5 text-right font-bold",
                                  d.diff > 0 ? "text-success" : "text-destructive"
                                )}>
                                  {d.diff > 0 ? "+" : ""}{fmtUSD(d.diff)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </TooltipContent>
              </UITooltip>

              {(criticalCount > 0 || warningCount > 0) && (
                <div className="hidden xl:flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 text-xs">
                  {criticalCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-destructive font-semibold">
                      <Flame className="h-3.5 w-3.5" /> {criticalCount}
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-warning font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" /> {warningCount}
                    </span>
                  )}
                </div>
              )}

              <UITooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/reconciliation"
                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Построчная сверка Excel ↔ JSON</TooltipContent>
              </UITooltip>

              <UITooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/admin"
                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <Lock className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Админка</TooltipContent>
              </UITooltip>

              <ThemeToggle />
            </div>
          </div>
        </header>

      <main className="mx-auto max-w-[1440px] px-6 py-8 space-y-8">
        {isOverview ? (
          <Tabs defaultValue="weekly" className="space-y-4">
            <TabsList>
              <TabsTrigger value="weekly">Понедельная аналитика</TabsTrigger>
              <TabsTrigger value="monthly">3PL Monthly</TabsTrigger>
            </TabsList>
            <TabsContent value="weekly" className="space-y-4">
              <OverviewAnalytics weeksMap={ALL_WEEKS} />
            </TabsContent>
            <TabsContent value="monthly" className="space-y-4">
              <MonthlyView />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-8">
        {/* === Уровень 1: Общие итоги === */}
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Сводка за неделю</h2>
              <UITooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Подробнее"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs bg-popover text-popover-foreground border shadow-md">
                  <p className="text-xs leading-relaxed">Итоговые показатели из листа 3PL_weekly · колонка TOTAL</p>
                </TooltipContent>
              </UITooltip>
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
        <AlertsPanel
          alerts={alerts}
          criticalCount={criticalCount}
          warningCount={warningCount}
          onSelectParty={(col) => setDetail({ kind: "party", col })}
        />

        {/* === Уровень 2: Разбивка по типам === */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Разбивка по типам бизнеса</h2>
            <UITooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Подробнее"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs bg-popover text-popover-foreground border shadow-md">
                <p className="text-xs leading-relaxed">CAINIAO — C2M экспорт. UZUM MPO и UZUM MKO — два независимых направления Crossborder</p>
              </TooltipContent>
            </UITooltip>
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
                  className="group relative overflow-hidden rounded-2xl glass-card p-6 shadow-elegant transition-all duration-300 hover:shadow-elevated hover:-translate-y-0.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background flex flex-col h-full"
                >
                  {/* glow accent */}
                  <div
                    className="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-30 blur-3xl"
                    style={{ backgroundColor: meta.color }}
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-glow shrink-0"
                        style={{ backgroundColor: meta.color }}
                      >
                        <TypeIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold uppercase tracking-wider truncate" style={{ color: meta.color }}>{meta.label}</p>
                          {t.note && (
                            <UITooltip>
                              <TooltipTrigger asChild>
                                <span
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted/70 text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors cursor-help"
                                >
                                  <Info className="h-2.5 w-2.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
                                {t.note}
                              </TooltipContent>
                            </UITooltip>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{meta.full}</p>
                      </div>
                    </div>
                    <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">{t.count} партий</span>
                  </div>

                  {/* Alert badges — fixed-height row so cards align perfectly */}
                  <div className="relative mt-4 min-h-[24px] flex flex-wrap items-center gap-2">
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
                    {counts.critical === 0 && counts.warning === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                        <ShieldCheck className="h-3 w-3" /> все маркеры в норме
                      </span>
                    )}
                  </div>

                  {/* KPI grid — uniform layout across all cards */}
                  <div className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-border/50 bg-background/40 p-4">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Выручка</p>
                      <p className="text-base font-bold tabular-nums mt-1">{fmtUSD(t.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Расходы</p>
                      <p className="text-base font-bold tabular-nums mt-1">{fmtUSD(t.expense)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Прибыль</p>
                      <p className={cn("text-base font-bold tabular-nums mt-1", t.gross_profit >= 0 ? "text-success" : "text-destructive")}>{fmtUSD(t.gross_profit)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">Маржа</p>
                      <p className={cn("text-base font-bold tabular-nums mt-1 inline-flex items-center gap-1", isHealthy ? "text-success" : "text-warning")}>
                        {isHealthy ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {t.margin_pct.toFixed(2)}%
                      </p>
                    </div>
                  </div>

                  {/* Spacer to keep card heights aligned regardless of note presence */}
                  <div className="mt-auto" />
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
              {(["ALL", "CAINIAO", "MPO", "MKO", "UZUM"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                    filter === f ? "gradient-primary text-white shadow-glow" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "ALL" ? "Все" : f === "UZUM" ? "UZUM MKO+MPO" : TYPE_META[f].label}
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
                  onSelectParty={(col) => setDetail({ kind: "party", col })}
                />
              </div>
            ))}

            {/* Маркер 4 — Соотношение продуктов (шт / кг) */}
            <SectionCard
              id="marker-4"
              title={
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg gradient-primary px-2 text-[11px] font-bold text-white shadow-glow tabular-nums">
                    M4
                  </span>
                  <h2 className="text-base sm:text-lg font-bold tracking-tight text-card-foreground truncate">
                    <span className="text-gradient">Маркер 4</span>
                    <span className="text-muted-foreground font-medium mx-1.5">·</span>
                    <span>Соотношение продуктов</span>
                  </h2>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Описание маркера"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-sm text-xs leading-snug">
                      <p className="font-semibold mb-0.5">Маркер 4 · Соотношение продуктов</p>
                      <p className="opacity-90">
                        Структура микса по странам и подтипам (RM/SRM/NRM и т. д.) в штуках или килограммах.
                        Показывает, какие категории дают основной объём.
                      </p>
                    </TooltipContent>
                  </UITooltip>
                </div>
              }
            >
              <ProductMix
                parties={parties}
                scope={filter === "ALL" || filter === "UZUM" ? { kind: "all" } : { kind: "type", type: filter }}
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
                        <div className="flex items-center gap-2 flex-wrap">
                          {worst === "critical" && <Flame className="h-3.5 w-3.5 text-destructive shrink-0" />}
                          {worst === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />}
                          {partyLabel(p)}
                          {p.is_hk_danger && (
                            <span
                              title="ОПАСНИК (JM HK) — груз HONG KONG"
                              className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive"
                            >
                              ⚠ ОПАСНИК (JM HK)
                            </span>
                          )}
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
        </div>
        )}
      </main>

      <DetailDialog
        target={detail}
        week={week}
        onOpenChange={(open) => !open && setDetail(null)}
        onSelectParty={(col) => setDetail({ kind: "party", col })}
      />
      </div>
    </TooltipProvider>
  );
}

/* === Алерты вверху === */
function AlertsPanel({
  alerts,
  criticalCount,
  warningCount,
  onSelectParty,
}: {
  alerts: Array<{ party: Party; marker: MarkerKey; value: number; avg: number; deviation: number; status: Status }>;
  criticalCount: number;
  warningCount: number;
  onSelectParty?: (col: string) => void;
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

  const renderCard = (a: { party: Party; marker: MarkerKey; value: number; avg: number; deviation: number; status: Status }, i: number) => {
    const meta = TYPE_META[a.party.type];
    const m = MARKER_META[a.marker];
    return (
      <button
        key={`${a.party.col}-${a.marker}-${i}`}
        type="button"
        onClick={() => onSelectParty?.(a.party.col)}
        className={cn(
          "w-full text-left rounded-xl border px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-elegant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer",
          a.status === "critical"
            ? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10"
            : "border-warning/40 bg-warning/5 hover:bg-warning/10"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: `color-mix(in oklab, ${meta.color} 20%, transparent)`, color: meta.color }}
              >
                {meta.label}
              </span>
              <span className="text-sm font-bold tabular-nums">№{partyLabel(a.party)}</span>
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
      </button>
    );
  };

  const MAX_PER_COL = 5;
  const critShown = critical.slice(0, MAX_PER_COL);
  const warnShown = warning.slice(0, MAX_PER_COL);
  const critRest = Math.max(0, critical.length - critShown.length);
  const warnRest = Math.max(0, warning.length - warnShown.length);

  return (
    <section className="rounded-2xl glass-card p-6 shadow-elegant">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl gradient-danger flex items-center justify-center text-white shadow-glow">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Требует внимания</h3>
            <UITooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Подробнее"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs bg-popover text-popover-foreground border shadow-md">
                <p className="text-xs leading-relaxed">Партии с отклонением выше нормы — клик по карточке откроет детали партии</p>
              </TooltipContent>
            </UITooltip>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Критичные */}
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="inline-flex items-center gap-2 text-destructive font-bold text-sm">
              <Flame className="h-4 w-4" /> Критично
            </div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {critical.length} {critical.length === 1 ? "партия" : "партий"}
            </span>
          </div>
          {critical.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
              Нет критических отклонений
            </div>
          ) : (
            <div className="space-y-2">
              {critShown.map((a, i) => renderCard(a, i))}
              {critRest > 0 && (
                <p className="text-[11px] text-muted-foreground text-center pt-1">…и ещё {critRest}</p>
              )}
            </div>
          )}
        </div>

        {/* Внимание */}
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="inline-flex items-center gap-2 text-warning font-bold text-sm">
              <AlertTriangle className="h-4 w-4" /> Внимание
            </div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {warning.length} {warning.length === 1 ? "партия" : "партий"}
            </span>
          </div>
          {warning.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
              Нет предупреждений
            </div>
          ) : (
            <div className="space-y-2">
              {warnShown.map((a, i) => renderCard(a, i))}
              {warnRest > 0 && (
                <p className="text-[11px] text-muted-foreground text-center pt-1">…и ещё {warnRest}</p>
              )}
            </div>
          )}
        </div>
      </div>
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
  onSelectParty,
}: {
  metric: MarkerKey;
  parties: Party[];
  allParties: Party[];
  typeAverages: Record<PartyType, Partial<Record<MarkerKey, number>>>;
  partyStatuses: Map<string, Record<MarkerKey, Status | null>>;
  onSelectParty?: (col: string) => void;
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

  // Для графика — пороги: фиксированные baseline для M2/M3, иначе от среднего по выборке
  const baseline = MARKER_BASELINE[metric];
  const criticalBase = MARKER_CRITICAL[metric];
  const refAvg = typeof baseline === "number" ? baseline : avg;
  const warnThr = typeof baseline === "number" ? baseline : avg * (1 + WARN_PCT);
  const critThr = typeof criticalBase === "number" ? criticalBase : (typeof baseline === "number" ? baseline * (1 + CRIT_PCT) : avg * (1 + CRIT_PCT));

  // Парсим "Маркер N · ..." на номер и название
  const titleMatch = meta.title.match(/^Маркер\s+(\d+)\s*·\s*(.+)$/);
  const markerNum = titleMatch?.[1] ?? "";
  const markerName = titleMatch?.[2] ?? meta.title;

  const styledTitle = (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg gradient-primary px-2 text-[11px] font-bold text-white shadow-glow tabular-nums">
        M{markerNum}
      </span>
      <h2 className="text-base sm:text-lg font-bold tracking-tight text-card-foreground truncate">
        <span className="text-gradient">Маркер {markerNum}</span>
        <span className="text-muted-foreground font-medium mx-1.5">·</span>
        <span>{markerName}</span>
      </h2>
      <UITooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Описание маркера"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm text-xs leading-snug">
          <p className="font-semibold mb-0.5">Маркер {markerNum} · {markerName}</p>
          <p className="opacity-90">{meta.description}</p>
        </TooltipContent>
      </UITooltip>
    </div>
  );

  return (
    <SectionCard title={styledTitle}>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
        <MiniStat label="Партий с данными" value={fmtNum(total)} />
        <MiniStat
          label={typeof baseline === "number" ? "Целевое (среднее)" : "Среднее"}
          value={`${fmtNum(refAvg, meta.decimals)}${meta.unit}`}
          accent="primary"
        />
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
          onBarClick={onSelectParty}
          avgOverride={refAvg}
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


