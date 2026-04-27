import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Percent,
  Boxes,
  Plane,
  PackageCheck,
  Banknote,
  Activity,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Globe2,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Target,
  Scale,
  type LucideIcon,
} from "lucide-react";
import type { Party, PartyType, WeekData } from "@/lib/types";
import { fmtUSD, fmtNum, fmtPct } from "@/lib/format";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { CountryDetailDialog, type CountryDetailData } from "@/components/CountryDetailDialog";
import { VolumeAndBreakdown, type VBPeriodPoint } from "@/components/VolumeAndBreakdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type KpiDrillKey = "revenue" | "expense" | "gross_profit" | "margin";
const KPI_DRILL_META: Record<KpiDrillKey, { label: string; description: string; color: string; icon: LucideIcon; format: (v: number) => string }> = {
  revenue: { label: "Σ Выручка", description: "Совокупная выручка за весь период с разбивкой по неделям, типам и партиям.", color: "var(--primary)", icon: Wallet, format: (v) => fmtUSD(v) },
  expense: { label: "Σ Расходы", description: "Все операционные расходы по партиям: 1-я миля, линейхолл, FOT, последняя миля.", color: "var(--destructive)", icon: Receipt, format: (v) => fmtUSD(v) },
  gross_profit: { label: "Σ Валовая прибыль", description: "Что осталось после операционных расходов в каждой неделе.", color: "var(--success)", icon: TrendingUp, format: (v) => fmtUSD(v) },
  margin: { label: "Средняя маржа", description: "GP ÷ Выручка по неделям. Цель — не ниже 5%, оптимум 15%+.", color: "var(--warning)", icon: Percent, format: (v) => `${v.toFixed(2)}%` },
};

const TYPE_META: Record<PartyType, { label: string; full: string; color: string; icon: LucideIcon }> = {
  CAINIAO: { label: "CAINIAO", full: "Cainiao C2M", color: "var(--cainiao)", icon: Plane },
  MPO: { label: "UZUM MPO", full: "UZUM Crossborder · MPO", color: "var(--mpo)", icon: PackageCheck },
  MKO: { label: "UZUM MKO", full: "UZUM Crossborder · MKO", color: "var(--mko)", icon: Banknote },
};

type TypeFilter = "ALL" | PartyType;
type MetricKey = "revenue" | "expense" | "gross_profit" | "margin_pct" | "pcs" | "kg";

const METRIC_META: Record<MetricKey, { label: string; color: string; format: (v: number) => string }> = {
  revenue: { label: "Выручка", color: "var(--primary)", format: (v) => fmtUSD(v) },
  expense: { label: "Расходы", color: "var(--destructive)", format: (v) => fmtUSD(v) },
  gross_profit: { label: "Прибыль", color: "var(--success)", format: (v) => fmtUSD(v) },
  margin_pct: { label: "Маржа %", color: "var(--warning)", format: (v) => `${v.toFixed(2)}%` },
  pcs: { label: "Штуки", color: "var(--cainiao)", format: (v) => `${fmtNum(v, 0)} шт` },
  kg: { label: "Кг", color: "var(--mpo)", format: (v) => `${fmtNum(v, 0)} кг` },
};

const COUNTRY_COLORS: Record<string, string> = {
  UZ: "var(--cainiao)",
  BY: "var(--mpo)",
  KG: "var(--mko)",
  AZ: "var(--warning)",
  KZ: "var(--success)",
};

export function OverviewAnalytics({
  weeksMap,
}: {
  weeksMap: Record<number, WeekData>;
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [kpiDrill, setKpiDrill] = useState<KpiDrillKey | null>(null);
  const [countryDrill, setCountryDrill] = useState<string | null>(null);
  const [typeDrill, setTypeDrill] = useState<PartyType | null>(null);
  const [volumeKpiDrill, setVolumeKpiDrill] = useState<"pcs" | "kg" | "avgw" | "rev_per_pcs" | null>(null);
  const [periodDrill, setPeriodDrill] = useState<number | null>(null); // week number
  const [matrixDrill, setMatrixDrill] = useState<{ country: string; type: PartyType } | null>(null);

  const allWeeks = useMemo(
    () => Object.keys(weeksMap).map(Number).sort((a, b) => a - b).map((n) => weeksMap[n]),
    [weeksMap]
  );
  const minWeek = allWeeks.length ? allWeeks[0].week : 1;
  const maxWeek = allWeeks.length ? allWeeks[allWeeks.length - 1].week : 1;
  const [weekFrom, setWeekFrom] = useState<number>(minWeek);
  const [weekTo, setWeekTo] = useState<number>(maxWeek);
  // Если данные перезагрузились с другим диапазоном — подстраховка
  const safeFrom = Math.max(minWeek, Math.min(weekFrom, maxWeek));
  const safeTo = Math.max(safeFrom, Math.min(weekTo, maxWeek));
  const sortedWeeks = useMemo(
    () => allWeeks.filter((w) => w.week >= safeFrom && w.week <= safeTo),
    [allWeeks, safeFrom, safeTo]
  );

  /** Агрегаты по неделям с учётом фильтра по типу. */
  const weeklySeries = useMemo(() => {
    return sortedWeeks.map((w) => {
      const parties =
        typeFilter === "ALL" ? w.parties : w.parties.filter((p) => p.type === typeFilter);
      const revenue = parties.reduce((s, p) => s + (p.revenue ?? 0), 0);
      const expense = parties.reduce((s, p) => s + (p.expense ?? 0), 0);
      const gross_profit = parties.reduce((s, p) => s + (p.gross_profit ?? 0), 0);
      const margin_pct = revenue > 0 ? (gross_profit / revenue) * 100 : 0;
      const pcs = parties.reduce((s, p) => {
        const totalMix = (p.mix ?? []).reduce((ss, m) => ss + (m.pcs ?? 0), 0);
        return s + (typeof p.total_pcs === "number" ? p.total_pcs : totalMix);
      }, 0);
      const kg = parties.reduce(
        (s, p) => s + ((p.mix ?? []).reduce((ss, m) => ss + (m.kg ?? 0), 0)),
        0
      );
      // Доли по типам (для stacked даже когда фильтр ALL)
      const byType = (["CAINIAO", "MPO", "MKO"] as PartyType[]).reduce((acc, t) => {
        const ps = w.parties.filter((p) => p.type === t);
        const r = ps.reduce((s, p) => s + (p.revenue ?? 0), 0);
        const e = ps.reduce((s, p) => s + (p.expense ?? 0), 0);
        const gp = ps.reduce((s, p) => s + (p.gross_profit ?? 0), 0);
        acc[`${t}_revenue`] = r;
        acc[`${t}_expense`] = e;
        acc[`${t}_profit`] = gp;
        return acc;
      }, {} as Record<string, number>);
      return {
        week: w.week,
        label: `W${w.week}`,
        period: w.period,
        revenue,
        expense,
        gross_profit,
        margin_pct,
        pcs,
        kg,
        parties: parties.length,
        ...byType,
      };
    });
  }, [sortedWeeks, typeFilter]);

  /** Глобальные KPI с дельтой между первой и последней неделей. */
  const totals = useMemo(() => {
    const sum = (k: "revenue" | "expense" | "gross_profit") =>
      weeklySeries.reduce((s, w) => s + w[k], 0);
    const revenue = sum("revenue");
    const expense = sum("expense");
    const gross_profit = sum("gross_profit");
    const margin = revenue > 0 ? (gross_profit / revenue) * 100 : 0;
    const partiesTotal = weeklySeries.reduce((s, w) => s + w.parties, 0);
    const avgWeekly = weeklySeries.length > 0 ? revenue / weeklySeries.length : 0;
    // Тренд: сравним среднее последних 4 недель и первых 4
    const first = weeklySeries.slice(0, 4);
    const last = weeklySeries.slice(-4);
    const avg = (arr: typeof weeklySeries, k: "revenue" | "gross_profit") =>
      arr.length ? arr.reduce((s, w) => s + w[k], 0) / arr.length : 0;
    const revFirst = avg(first, "revenue");
    const revLast = avg(last, "revenue");
    const revTrend = revFirst > 0 ? ((revLast - revFirst) / revFirst) * 100 : 0;
    const gpFirst = avg(first, "gross_profit");
    const gpLast = avg(last, "gross_profit");
    const gpTrend = gpFirst !== 0 ? ((gpLast - gpFirst) / Math.abs(gpFirst)) * 100 : 0;
    return { revenue, expense, gross_profit, margin, partiesTotal, avgWeekly, revTrend, gpTrend };
  }, [weeklySeries]);

  /** Лучшая / худшая неделя по выбранной метрике. */
  const extremes = useMemo(() => {
    if (weeklySeries.length === 0) return null;
    const sorted = [...weeklySeries].sort((a, b) => (b[metric] as number) - (a[metric] as number));
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  }, [weeklySeries, metric]);

  /** Распределение по типам за весь период. */
  const typeBreakdown = useMemo(() => {
    return (["CAINIAO", "MPO", "MKO"] as PartyType[]).map((t) => {
      const all: Party[] = sortedWeeks.flatMap((w) => w.parties.filter((p) => p.type === t));
      const revenue = all.reduce((s, p) => s + (p.revenue ?? 0), 0);
      const expense = all.reduce((s, p) => s + (p.expense ?? 0), 0);
      const profit = all.reduce((s, p) => s + (p.gross_profit ?? 0), 0);
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        type: t,
        label: TYPE_META[t].label,
        color: TYPE_META[t].color,
        count: all.length,
        revenue,
        expense,
        profit,
        margin,
      };
    });
  }, [sortedWeeks]);

  /** Mix по странам (агрегат по всем неделям с фильтром по типу). */
  const countryBreakdown = useMemo(() => {
    const map = new Map<string, { pcs: number; kg: number }>();
    sortedWeeks.forEach((w) => {
      w.parties.forEach((p) => {
        if (typeFilter !== "ALL" && p.type !== typeFilter) return;
        (p.mix ?? []).forEach((m) => {
          const cur = map.get(m.country) ?? { pcs: 0, kg: 0 };
          cur.pcs += m.pcs ?? 0;
          cur.kg += m.kg ?? 0;
          map.set(m.country, cur);
        });
      });
    });
    return Array.from(map.entries())
      .map(([country, v]) => ({ country, ...v }))
      .filter((r) => r.pcs > 0 || r.kg > 0)
      .sort((a, b) => b.pcs - a.pcs);
  }, [sortedWeeks, typeFilter]);

  /** Подробные данные по выбранной стране для модалки. */
  const countryDetailData = useMemo<CountryDetailData | null>(() => {
    if (!countryDrill) return null;
    const cc = countryDrill;
    const totalAllPcs = countryBreakdown.reduce((s, r) => s + r.pcs, 0);

    // Trend по неделям
    const trend = sortedWeeks.map((w) => {
      let pcs = 0;
      let kg = 0;
      let revenue = 0;
      let expense = 0;
      let totalWeekPcs = 0;
      w.parties.forEach((p) => {
        if (typeFilter !== "ALL" && p.type !== typeFilter) return;
        const partyTotalMixPcs = (p.mix ?? []).reduce((s, m) => s + (m.pcs ?? 0), 0);
        const countryMix = (p.mix ?? []).filter((m) => m.country === cc);
        const partyCountryPcs = countryMix.reduce((s, m) => s + (m.pcs ?? 0), 0);
        const partyCountryKg = countryMix.reduce((s, m) => s + (m.kg ?? 0), 0);
        pcs += partyCountryPcs;
        kg += partyCountryKg;
        // Аллокация revenue/expense пропорционально доле штук этой страны в партии
        if (partyTotalMixPcs > 0 && partyCountryPcs > 0) {
          const share = partyCountryPcs / partyTotalMixPcs;
          revenue += (p.revenue ?? 0) * share;
          expense += (p.expense ?? 0) * share;
        }
        totalWeekPcs += partyTotalMixPcs;
      });
      return {
        label: `W${w.week}`,
        period: w.period,
        pcs,
        kg: Math.round(kg * 10) / 10,
        revenue: Math.round(revenue),
        expense: Math.round(expense),
        gross_profit: Math.round(revenue - expense),
      };
    }).filter((p) => p.pcs > 0);

    // Subtypes по стране (агрегат)
    const subMap = new Map<string, { pcs: number; kg: number }>();
    sortedWeeks.forEach((w) => {
      w.parties.forEach((p) => {
        if (typeFilter !== "ALL" && p.type !== typeFilter) return;
        (p.mix ?? []).forEach((m) => {
          if (m.country !== cc) return;
          const prev = subMap.get(m.subtype) ?? { pcs: 0, kg: 0 };
          prev.pcs += m.pcs ?? 0;
          prev.kg += m.kg ?? 0;
          subMap.set(m.subtype, prev);
        });
      });
    });
    const subtypes = Array.from(subMap.entries())
      .map(([name, v]) => ({ name, pcs: v.pcs, kg: Math.round(v.kg * 10) / 10 }))
      .sort((a, b) => b.pcs - a.pcs);

    // Top parties (по доле страны в партии × прибыль)
    const partyContribs: { label: string; week: number; revenue: number; gross_profit: number; margin_pct: number | null }[] = [];
    sortedWeeks.forEach((w) => {
      w.parties.forEach((p) => {
        if (typeFilter !== "ALL" && p.type !== typeFilter) return;
        const partyTotalMixPcs = (p.mix ?? []).reduce((s, m) => s + (m.pcs ?? 0), 0);
        const partyCountryPcs = (p.mix ?? []).filter((m) => m.country === cc).reduce((s, m) => s + (m.pcs ?? 0), 0);
        if (partyCountryPcs === 0 || partyTotalMixPcs === 0) return;
        const share = partyCountryPcs / partyTotalMixPcs;
        const rev = (p.revenue ?? 0) * share;
        const exp = (p.expense ?? 0) * share;
        const gp = rev - exp;
        partyContribs.push({
          label: `${p.type} #${p.num}`,
          week: w.week,
          revenue: Math.round(rev),
          gross_profit: Math.round(gp),
          margin_pct: rev > 0 ? (gp / rev) * 100 : null,
        });
      });
    });
    const topParties = partyContribs.sort((a, b) => b.gross_profit - a.gross_profit).slice(0, 8);

    const totalPcs = trend.reduce((s, t) => s + t.pcs, 0);
    const totalKg = trend.reduce((s, t) => s + t.kg, 0);
    const totalRev = trend.reduce((s, t) => s + (t.revenue ?? 0), 0);
    const totalExp = trend.reduce((s, t) => s + (t.expense ?? 0), 0);
    const totalGp = totalRev - totalExp;

    return {
      country: cc,
      totals: {
        pcs: totalPcs,
        kg: Math.round(totalKg * 10) / 10,
        revenue: totalRev,
        expense: totalExp,
        gross_profit: totalGp,
        margin_pct: totalRev > 0 ? (totalGp / totalRev) * 100 : 0,
      },
      share_pct: totalAllPcs > 0 ? (totalPcs / totalAllPcs) * 100 : 0,
      trend,
      subtypes,
      topParties,
      trendKind: "week",
    };
  }, [countryDrill, sortedWeeks, typeFilter, countryBreakdown]);

  const topParties = useMemo(() => {
    const list = sortedWeeks.flatMap((w) =>
      w.parties.filter((p) => typeFilter === "ALL" || p.type === typeFilter).map((p) => ({ ...p, _week: w.week }))
    );
    return list.sort((a, b) => b.gross_profit - a.gross_profit).slice(0, 10);
  }, [sortedWeeks, typeFilter]);


  /** Данные для VolumeAndBreakdown — по неделям с byCountry/byType. */
  const volumeWeeklyData = useMemo<VBPeriodPoint[]>(() => {
    return sortedWeeks.map((w) => {
      const parties = typeFilter === "ALL" ? w.parties : w.parties.filter((p) => p.type === typeFilter);
      // byType (нативно)
      const byType: VBPeriodPoint["byType"] = {};
      (["CAINIAO", "MPO", "MKO"] as PartyType[]).forEach((t) => {
        const ps = parties.filter((p) => p.type === t);
        const pcs = ps.reduce((s, p) => {
          const totalMix = (p.mix ?? []).reduce((ss, m) => ss + (m.pcs ?? 0), 0);
          return s + (typeof p.total_pcs === "number" ? p.total_pcs : totalMix);
        }, 0);
        const kg = ps.reduce((s, p) => s + ((p.mix ?? []).reduce((ss, m) => ss + (m.kg ?? 0), 0)), 0);
        byType[t] = {
          pcs,
          kg,
          revenue: ps.reduce((s, p) => s + (p.revenue ?? 0), 0),
          expense: ps.reduce((s, p) => s + (p.expense ?? 0), 0),
          gross_profit: ps.reduce((s, p) => s + (p.gross_profit ?? 0), 0),
        };
      });
      // byCountry — аллокация по mix
      const byCountry: VBPeriodPoint["byCountry"] = {};
      parties.forEach((p) => {
        const mix = p.mix ?? [];
        const totalMixPcs = mix.reduce((s, m) => s + (m.pcs ?? 0), 0);
        if (totalMixPcs <= 0) return;
        mix.forEach((m) => {
          const cc = m.country;
          const share = (m.pcs ?? 0) / totalMixPcs;
          const cur = byCountry[cc] ?? { pcs: 0, kg: 0, revenue: 0, expense: 0, gross_profit: 0 };
          cur.pcs += m.pcs ?? 0;
          cur.kg += m.kg ?? 0;
          cur.revenue += (p.revenue ?? 0) * share;
          cur.expense += (p.expense ?? 0) * share;
          cur.gross_profit += (p.gross_profit ?? 0) * share;
          byCountry[cc] = cur;
        });
      });
      const totalPcs = Object.values(byCountry).reduce((s, v) => s + v.pcs, 0);
      const totalKg = Object.values(byCountry).reduce((s, v) => s + v.kg, 0);
      return {
        label: `W${w.week}`,
        period: w.period,
        pcs: totalPcs,
        kg: totalKg,
        revenue: parties.reduce((s, p) => s + (p.revenue ?? 0), 0),
        expense: parties.reduce((s, p) => s + (p.expense ?? 0), 0),
        gross_profit: parties.reduce((s, p) => s + (p.gross_profit ?? 0), 0),
        byCountry,
        byType,
      };
    });
  }, [sortedWeeks, typeFilter]);

  /** Аналитика по маркерам M1..M4 — динамика по неделям + распределение по типам + статусы. */
  const markersAnalytics = useMemo(() => {
    type MK = "marker1_tariff" | "marker2_volnet" | "marker3_grossnet" | "marker4_pcs";
    const MARKERS: { key: MK; short: string; title: string; unit: string; decimals: number; direction: "above" | "below"; color: string }[] = [
      { key: "marker1_tariff", short: "M1 · Тариф", title: "Тариф Лайнхолла", unit: " $/кг", decimals: 2, direction: "above", color: "var(--chart-1)" },
      { key: "marker2_volnet", short: "M2 · Vol/Net", title: "Объёмный / Нетто", unit: "x", decimals: 3, direction: "above", color: "var(--chart-2)" },
      { key: "marker3_grossnet", short: "M3 · Gross/Net", title: "Брутто / Нетто", unit: "x", decimals: 3, direction: "above", color: "var(--chart-4)" },
      { key: "marker4_pcs", short: "M4 · Mix", title: "Соотношение продуктов", unit: " шт", decimals: 0, direction: "above", color: "var(--chart-5)" },
    ];
    const getVal = (p: Party, k: MK): number | null => {
      if (k === "marker4_pcs") {
        const total = typeof p.total_pcs === "number"
          ? p.total_pcs
          : (p.mix ?? []).reduce((s, m) => s + (m.pcs ?? 0), 0);
        return total > 0 ? total : null;
      }
      const v = p[k as keyof Party] as number | null;
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const filteredParties = (w: WeekData) =>
      typeFilter === "ALL" ? w.parties : w.parties.filter((p) => p.type === typeFilter);
    return MARKERS.map((m) => {
      const isSum = m.key === "marker4_pcs";
      const reduce = (vals: number[]) =>
        vals.length ? (isSum ? vals.reduce((s, v) => s + v, 0) : vals.reduce((s, v) => s + v, 0) / vals.length) : null;
      // Тренд по неделям (сумма для M4, среднее для остальных)
      const series = sortedWeeks.map((w) => {
        const ps = filteredParties(w);
        const vals = ps.map((p) => getVal(p, m.key)).filter((v): v is number => v != null);
        return { label: `W${w.week}`, period: w.period, value: reduce(vals) };
      });
      // По типу за весь период
      const byTypeAvg = (["CAINIAO", "MPO", "MKO"] as PartyType[]).map((t) => {
        const ps = sortedWeeks.flatMap((w) => w.parties.filter((p) => p.type === t));
        const vals = ps.map((p) => getVal(p, m.key)).filter((v): v is number => v != null);
        return { type: t, label: TYPE_META[t].label, color: TYPE_META[t].color, value: reduce(vals), count: vals.length };
      }).filter((d) => d.value != null);
      // Глобальная статистика
      const allVals = sortedWeeks.flatMap((w) => filteredParties(w).map((p) => getVal(p, m.key))).filter((v): v is number => v != null);
      const globalAvg = isSum
        ? (series.filter(s => s.value != null).length ? series.reduce((s, x) => s + (x.value ?? 0), 0) / series.filter(s => s.value != null).length : null)
        : (allVals.length ? allVals.reduce((s, v) => s + v, 0) / allVals.length : null);
      const min = allVals.length ? Math.min(...allVals) : null;
      const max = allVals.length ? Math.max(...allVals) : null;
      // Тренд: первые 4 vs последние 4 непустые недели
      const valid = series.filter((s) => s.value != null) as { label: string; period: string; value: number }[];
      const first = valid.slice(0, 4);
      const last = valid.slice(-4);
      const avgArr = (a: typeof valid) => (a.length ? a.reduce((s, x) => s + x.value, 0) / a.length : 0);
      const firstAvg = avgArr(first);
      const lastAvg = avgArr(last);
      const trendPct = firstAvg !== 0 ? ((lastAvg - firstAvg) / Math.abs(firstAvg)) * 100 : 0;
      // Доля партий в зоне риска относительно глобального среднего
      let warnCount = 0;
      let critCount = 0;
      if (globalAvg != null && globalAvg !== 0) {
        allVals.forEach((v) => {
          const ratio = v / globalAvg;
          if (m.direction === "above") {
            if (ratio >= 1.2) critCount++;
            else if (ratio >= 1.1) warnCount++;
          } else {
            if (ratio <= 0.8) critCount++;
            else if (ratio <= 0.9) warnCount++;
          }
        });
      }
      const total = allVals.length;
      return { meta: m, series, byTypeAvg, globalAvg, min, max, trendPct, warnCount, critCount, total };
    });
  }, [sortedWeeks, typeFilter]);

  /** Insights — автоматические выводы. */
  const insights = useMemo(() => {
    const items: { tone: "good" | "warn" | "bad" | "info"; title: string; text: string }[] = [];
    if (totals.revTrend >= 5) {
      items.push({ tone: "good", title: "Растущая выручка", text: `Средняя выручка последних 4 недель выше первых 4 на ${totals.revTrend.toFixed(1)}%.` });
    } else if (totals.revTrend <= -5) {
      items.push({ tone: "bad", title: "Падение выручки", text: `Выручка снизилась на ${Math.abs(totals.revTrend).toFixed(1)}% относительно начала периода.` });
    }
    if (totals.margin < 5) {
      items.push({ tone: "bad", title: "Низкая маржа", text: `Средняя маржа ${totals.margin.toFixed(2)}% — ниже целевого порога 5%.` });
    } else if (totals.margin >= 15) {
      items.push({ tone: "good", title: "Высокая маржа", text: `Средняя маржа ${totals.margin.toFixed(2)}% — выше отраслевого ориентира.` });
    }
    // Лидер по прибыли
    const leader = [...typeBreakdown].sort((a, b) => b.profit - a.profit)[0];
    if (leader && leader.profit > 0) {
      items.push({ tone: "info", title: `Лидер по прибыли — ${leader.label}`, text: `Принёс ${fmtUSD(leader.profit)} (${leader.margin.toFixed(2)}% маржи) за ${leader.count} партий.` });
    }
    // Убыточный тип
    const loser = typeBreakdown.find((t) => t.profit < 0);
    if (loser) {
      items.push({ tone: "warn", title: `${loser.label} убыточен`, text: `Совокупный убыток ${fmtUSD(loser.profit)} при выручке ${fmtUSD(loser.revenue)}.` });
    }
    // Худшая неделя по марже
    const worstMargin = [...weeklySeries].filter((w) => w.revenue > 0).sort((a, b) => a.margin_pct - b.margin_pct)[0];
    if (worstMargin && worstMargin.margin_pct < 0) {
      items.push({ tone: "bad", title: `Убыточная неделя ${worstMargin.label}`, text: `Маржа ${worstMargin.margin_pct.toFixed(2)}% · ${worstMargin.period}.` });
    }
    return items;
  }, [totals, typeBreakdown, weeklySeries]);


  /** Drill-down данные для активного KPI: серия по неделям + по типам + топ партий. */
  const kpiDrillData = useMemo(() => {
    if (!kpiDrill) return null;
    const valueOf = (v: { revenue: number; expense: number; gross_profit: number; margin_pct: number }) => {
      if (kpiDrill === "margin") return v.margin_pct;
      return v[kpiDrill] as number;
    };
    const series = weeklySeries.map((w) => ({
      label: w.label,
      period: w.period,
      value: valueOf(w),
      revenue: w.revenue,
      expense: w.expense,
      gross_profit: w.gross_profit,
      margin_pct: w.margin_pct,
      parties: w.parties,
    }));
    const validSeries = series.filter((s) => Number.isFinite(s.value));
    const sorted = [...validSeries].sort((a, b) => b.value - a.value);
    const best = sorted[0] ?? null;
    const worst = sorted[sorted.length - 1] ?? null;

    const byType = (["CAINIAO", "MPO", "MKO"] as PartyType[]).map((t) => {
      const all = sortedWeeks.flatMap((w) => w.parties.filter((p) => p.type === t));
      const revenue = all.reduce((s, p) => s + (p.revenue ?? 0), 0);
      const expense = all.reduce((s, p) => s + (p.expense ?? 0), 0);
      const gross_profit = all.reduce((s, p) => s + (p.gross_profit ?? 0), 0);
      const margin_pct = revenue > 0 ? (gross_profit / revenue) * 100 : 0;
      const value = valueOf({ revenue, expense, gross_profit, margin_pct });
      return {
        type: t,
        label: TYPE_META[t].label,
        full: TYPE_META[t].full,
        color: TYPE_META[t].color,
        count: all.length,
        revenue,
        expense,
        gross_profit,
        margin_pct,
        value,
      };
    });
    const totalAbs = byType.reduce((s, t) => s + Math.abs(t.value), 0) || 1;
    const byTypeWithShare = byType.map((t) => ({ ...t, share: (Math.abs(t.value) / totalAbs) * 100 }));

    const partyMetric = (p: Party): number => {
      if (kpiDrill === "margin") return p.margin_pct ?? 0;
      const v = p[kpiDrill] as number | null | undefined;
      return typeof v === "number" ? v : 0;
    };
    const allParties = sortedWeeks.flatMap((w) =>
      w.parties
        .filter((p) => typeFilter === "ALL" || p.type === typeFilter)
        .map((p) => ({ p, week: w.week, period: w.period }))
    );
    const topParties = [...allParties]
      .filter(({ p }) => Number.isFinite(partyMetric(p)))
      .sort((a, b) => partyMetric(b.p) - partyMetric(a.p))
      .slice(0, 10);
    const bottomParties = [...allParties]
      .filter(({ p }) => Number.isFinite(partyMetric(p)))
      .sort((a, b) => partyMetric(a.p) - partyMetric(b.p))
      .slice(0, 5);

    const total = validSeries.reduce((s, w) => s + w.value, 0);
    const avg = validSeries.length ? total / validSeries.length : 0;

    return { series, best, worst, byType: byTypeWithShare, topParties, bottomParties, total, avg, partyMetric };
  }, [kpiDrill, weeklySeries, sortedWeeks, typeFilter]);


  return (
    <>
    <div className="space-y-8">
      {/* Фильтры */}
      <div className="rounded-2xl glass-card p-4 shadow-elegant">
        <div className="flex items-center gap-2 text-sm font-semibold mb-3">
          <Filter className="h-4 w-4 text-primary" />
          Фильтры аналитики
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {/* Период */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Период</span>
            <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card/60 p-1">
              <select
                value={safeFrom}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setWeekFrom(v);
                  if (v > safeTo) setWeekTo(v);
                }}
                className="bg-transparent text-xs font-semibold px-2 py-1.5 rounded-lg outline-none cursor-pointer hover:bg-muted/40"
              >
                {allWeeks.map((w) => (
                  <option key={w.week} value={w.week}>W{w.week}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">→</span>
              <select
                value={safeTo}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setWeekTo(v);
                  if (v < safeFrom) setWeekFrom(v);
                }}
                className="bg-transparent text-xs font-semibold px-2 py-1.5 rounded-lg outline-none cursor-pointer hover:bg-muted/40"
              >
                {allWeeks.map((w) => (
                  <option key={w.week} value={w.week}>W{w.week}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => { setWeekFrom(minWeek); setWeekTo(maxWeek); }}
              className={cn(
                "px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-border transition-all",
                safeFrom === minWeek && safeTo === maxWeek
                  ? "gradient-primary text-white shadow-glow border-transparent"
                  : "bg-card/60 text-muted-foreground hover:text-foreground"
              )}
            >
              Все
            </button>
          </div>

          <div className="h-6 w-px bg-border/60" />

          {/* Тип */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Тип</span>
            <div className="inline-flex rounded-xl border border-border bg-card/60 p-1 gap-0.5">
              {(["ALL", "CAINIAO", "MPO", "MKO"] as TypeFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                    typeFilter === f
                      ? "gradient-primary text-white shadow-glow"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "ALL" ? "Все" : TYPE_META[f].label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-6 w-px bg-border/60" />

          {/* Метрика */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Метрика</span>
            <div className="inline-flex rounded-xl border border-border bg-card/60 p-1 gap-0.5">
              {(Object.keys(METRIC_META) as MetricKey[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                    metric === m
                      ? "gradient-primary text-white shadow-glow"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {METRIC_META[m].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* KPI с трендами */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Σ Выручка · период"
          value={fmtUSD(totals.revenue)}
          hint={
            <span
              className={cn(
                "inline-flex items-center gap-1",
                totals.revTrend >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {totals.revTrend >= 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {totals.revTrend >= 0 ? "+" : ""}
              {totals.revTrend.toFixed(1)}% тренд (4 нед)
            </span>
          }
          accent="primary"
          icon={<Wallet className="h-5 w-5" />}
          onClick={() => setKpiDrill("revenue")}
        />
        <StatCard
          label="Σ Расходы"
          value={fmtUSD(totals.expense)}
          hint={`${fmtPct(totals.expense / totals.revenue)} от выручки`}
          accent="destructive"
          icon={<Receipt className="h-5 w-5" />}
          onClick={() => setKpiDrill("expense")}
        />
        <StatCard
          label="Σ Валовая прибыль"
          value={fmtUSD(totals.gross_profit)}
          hint={
            <span
              className={cn(
                "inline-flex items-center gap-1",
                totals.gpTrend >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {totals.gpTrend >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {totals.gpTrend >= 0 ? "+" : ""}
              {totals.gpTrend.toFixed(1)}% тренд (4 нед)
            </span>
          }
          accent="success"
          icon={<TrendingUp className="h-5 w-5" />}
          onClick={() => setKpiDrill("gross_profit")}
        />
        <StatCard
          label="Средняя маржа"
          value={`${totals.margin.toFixed(2)}%`}
          hint={`${totals.partiesTotal} партий · ${fmtUSD(totals.avgWeekly)}/нед`}
          accent="warning"
          icon={<Percent className="h-5 w-5" />}
          onClick={() => setKpiDrill("margin")}
        />
      </section>

      {/* Главный тренд: выбранная метрика по неделям */}
      <SectionCard
        title={`Динамика по неделям · ${METRIC_META[metric].label}`}
        description={
          typeFilter === "ALL"
            ? "Все типы суммарно"
            : `Только ${TYPE_META[typeFilter as PartyType].full}`
        }
      >
        <div className="h-72">
          <ResponsiveContainer>
            <AreaChart data={weeklySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-metric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={METRIC_META[metric].color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={METRIC_META[metric].color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) =>
                  metric === "margin_pct"
                    ? `${v.toFixed(0)}%`
                    : metric === "pcs" || metric === "kg"
                      ? `${(v / 1000).toFixed(0)}k`
                      : `$${(v / 1000).toFixed(0)}k`
                }
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelFormatter={(l, payload) => {
                  const p = payload?.[0]?.payload as (typeof weeklySeries)[number] | undefined;
                  return p ? `${l} · ${p.period}` : l;
                }}
                formatter={(v: number) => [METRIC_META[metric].format(v), METRIC_META[metric].label]}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke={METRIC_META[metric].color}
                strokeWidth={2.5}
                fill="url(#grad-metric)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {extremes && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-success font-bold">Лучшая неделя</p>
              <p className="font-semibold mt-0.5">
                {extremes.best.label} · {METRIC_META[metric].format(extremes.best[metric] as number)}
              </p>
              <p className="text-xs text-muted-foreground">{extremes.best.period}</p>
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-destructive font-bold">Худшая неделя</p>
              <p className="font-semibold mt-0.5">
                {extremes.worst.label} · {METRIC_META[metric].format(extremes.worst[metric] as number)}
              </p>
              <p className="text-xs text-muted-foreground">{extremes.worst.period}</p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Stacked outflow + Margin overlay */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Выручка по типам · стэк по неделям"
          description="Видно, как меняется доля CAINIAO / MPO / MKO"
          className="lg:col-span-2"
        >
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={weeklySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number, n) => [fmtUSD(v), n as string]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="CAINIAO_revenue"
                  stackId="rev"
                  name="CAINIAO"
                  fill="var(--cainiao)"
                  radius={[0, 0, 0, 0]}
                />
                <Bar dataKey="MPO_revenue" stackId="rev" name="UZUM MPO" fill="var(--mpo)" />
                <Bar
                  dataKey="MKO_revenue"
                  stackId="rev"
                  name="UZUM MKO"
                  fill="var(--mko)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Доли типов · период" description="Структура выручки за весь период">
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={typeBreakdown.map((t) => ({ name: t.label, value: t.revenue, fill: t.color }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={3}
                >
                  {typeBreakdown.map((t, i) => (
                    <Cell key={i} fill={t.color} stroke="var(--card)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number, n) => [fmtUSD(v), n as string]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Прибыль + Маржа (двойная ось) */}
      <SectionCard
        title="Прибыль и маржа · по неделям"
        description="Бары — валовая прибыль, линия — маржа %"
      >
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={weeklySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis
                yAxisId="left"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--warning)"
                fontSize={11}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number, n: string) =>
                  n === "Маржа %" ? [`${v.toFixed(2)}%`, n] : [fmtUSD(v), n]
                }
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="left"
                dataKey="gross_profit"
                name="Прибыль"
                fill="var(--success)"
                radius={[6, 6, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="margin_pct"
                name="Маржа %"
                stroke="var(--warning)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Выручка vs Расходы — линии */}
      <SectionCard
        title="Выручка vs Расходы · тренд"
        description="Сравнение динамики оборота и операционных затрат"
      >
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={weeklySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number, n) => [fmtUSD(v), n as string]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Выручка"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="expense"
                name="Расходы"
                stroke="var(--destructive)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>


      {/* Аналитика по маркерам M1..M4 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-base font-semibold tracking-tight inline-flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" /> Аналитика по маркерам · M1–M4
          </h3>
          <p className="text-xs text-muted-foreground">
            Динамика среднего значения по неделям, разбивка по типам и доля партий в зоне риска
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {markersAnalytics.map((m) => {
            const trendBad = m.meta.direction === "above" ? m.trendPct > 0 : m.trendPct < 0;
            const trendGood = m.meta.direction === "above" ? m.trendPct < 0 : m.trendPct > 0;
            const valid = m.series.filter((s) => s.value != null);
            return (
              <div
                key={m.meta.key}
                className="rounded-2xl glass-card p-4 shadow-elegant space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${m.meta.color} 22%, transparent)`,
                        color: m.meta.color,
                      }}
                    >
                      <Gauge className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{m.meta.short}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{m.meta.title}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      средн. за период
                    </p>
                    <p className="text-base font-bold tabular-nums">
                      {m.globalAvg != null ? `${fmtNum(m.globalAvg, m.meta.decimals)}${m.meta.unit}` : "—"}
                    </p>
                  </div>
                </div>

                {/* мини-метрики */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-border/60 bg-card/40 px-2 py-1.5">
                    <p className="text-[9px] uppercase text-muted-foreground tracking-wider font-semibold">min</p>
                    <p className="text-xs font-bold tabular-nums">
                      {m.min != null ? `${fmtNum(m.min, m.meta.decimals)}${m.meta.unit}` : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card/40 px-2 py-1.5">
                    <p className="text-[9px] uppercase text-muted-foreground tracking-wider font-semibold">тренд 4w</p>
                    <p
                      className={cn(
                        "text-xs font-bold tabular-nums inline-flex items-center justify-center gap-0.5",
                        trendBad ? "text-destructive" : trendGood ? "text-success" : "text-muted-foreground"
                      )}
                    >
                      {m.trendPct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {m.trendPct >= 0 ? "+" : ""}
                      {m.trendPct.toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card/40 px-2 py-1.5">
                    <p className="text-[9px] uppercase text-muted-foreground tracking-wider font-semibold">max</p>
                    <p className="text-xs font-bold tabular-nums">
                      {m.max != null ? `${fmtNum(m.max, m.meta.decimals)}${m.meta.unit}` : "—"}
                    </p>
                  </div>
                </div>

                {/* линия по неделям */}
                <div className="h-32">
                  <ResponsiveContainer>
                    <LineChart data={m.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={9} tickLine={false} axisLine={false} />
                      <YAxis hide domain={["auto", "auto"]} />
                      <Tooltip
                        cursor={{ stroke: "var(--accent)", strokeWidth: 1 }}
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          fontSize: 11,
                          padding: "6px 10px",
                        }}
                        formatter={(v: number) => [
                          v != null ? `${fmtNum(v, m.meta.decimals)}${m.meta.unit}` : "—",
                          m.meta.short,
                        ]}
                      />
                      {m.globalAvg != null && (
                        <ReferenceLine y={m.globalAvg} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeOpacity={0.6} />
                      )}
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={m.meta.color}
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* по типам */}
                {m.byTypeAvg.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Среднее по типам
                    </p>
                    {m.byTypeAvg.map((t) => {
                      const pct =
                        m.max != null && m.min != null && m.max > m.min && t.value != null
                          ? ((t.value - m.min) / (m.max - m.min)) * 100
                          : 50;
                      return (
                        <div key={t.type} className="flex items-center gap-2 text-xs">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: t.color }}
                          />
                          <span className="font-semibold w-20 shrink-0">{t.label}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.max(4, Math.min(100, pct))}%`, backgroundColor: t.color }}
                            />
                          </div>
                          <span className="tabular-nums font-semibold w-20 text-right">
                            {t.value != null ? `${fmtNum(t.value, m.meta.decimals)}${m.meta.unit}` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* зоны риска */}
                {m.total > 0 && (
                  <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-border/60">
                    <span className="inline-flex items-center gap-1 text-success font-semibold">
                      <CheckCircle2 className="h-3 w-3" /> норма {m.total - m.warnCount - m.critCount}
                    </span>
                    <span className="inline-flex items-center gap-1 text-warning font-semibold">
                      <AlertTriangle className="h-3 w-3" /> внимание {m.warnCount}
                    </span>
                    <span className="inline-flex items-center gap-1 text-destructive font-semibold">
                      <AlertTriangle className="h-3 w-3" /> критич. {m.critCount}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {m.meta.direction === "above" ? "↑ выше = хуже" : "↓ ниже = хуже"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Insights / автоматические выводы */}
      {insights.length > 0 && (
        <SectionCard
          title="Ключевые выводы"
          description="Автоматическая интерпретация показателей"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((it, i) => {
              const palette =
                it.tone === "good"
                  ? { bg: "bg-success/5", border: "border-success/30", text: "text-success", Icon: CheckCircle2 }
                  : it.tone === "bad"
                    ? { bg: "bg-destructive/5", border: "border-destructive/30", text: "text-destructive", Icon: AlertTriangle }
                    : it.tone === "warn"
                      ? { bg: "bg-warning/5", border: "border-warning/30", text: "text-warning", Icon: AlertTriangle }
                      : { bg: "bg-primary/5", border: "border-primary/30", text: "text-primary", Icon: Sparkles };
              const Icon = palette.Icon;
              return (
                <div
                  key={i}
                  className={cn("rounded-xl border p-4 flex items-start gap-3", palette.bg, palette.border)}
                >
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", palette.bg, palette.text)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={cn("text-sm font-bold", palette.text)}>{it.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{it.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Эффективность типов · scatter-style карточки */}
      <SectionCard
        title="Эффективность типов · доля выручки vs маржа"
        description="Сравнение вклада в оборот и рентабельности"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {typeBreakdown.map((t) => {
            const share = totals.revenue > 0 ? (t.revenue / totals.revenue) * 100 : 0;
            const score = share * 0.4 + Math.max(0, t.margin) * 0.6;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => setTypeDrill(t.type)}
                className="text-left rounded-xl border border-border bg-card/40 p-4 space-y-3 transition-all hover:border-primary/60 hover:bg-card/80 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: t.color }}>
                    {t.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
                    <Target className="h-3 w-3" /> score {score.toFixed(1)}
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    <span>Доля выручки</span>
                    <span>{share.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, share)}%`, backgroundColor: t.color }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    <span>Маржа</span>
                    <span
                      className={cn(
                        t.margin >= 15 ? "text-success" : t.margin >= 5 ? "text-warning" : "text-destructive"
                      )}
                    >
                      {t.margin.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        t.margin >= 15 ? "bg-success" : t.margin >= 5 ? "bg-warning" : "bg-destructive"
                      )}
                      style={{ width: `${Math.max(2, Math.min(100, Math.abs(t.margin) * 2))}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                  <span className="inline-flex items-center gap-1">
                    <Scale className="h-3 w-3" /> {t.count} партий
                  </span>
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      t.profit >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {fmtUSD(t.profit)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 italic">нажмите для деталей</p>
              </button>
            );
          })}
        </div>
      </SectionCard>


      <section>
        <h3 className="text-base font-semibold tracking-tight mb-3 inline-flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" /> Сводка по типам бизнеса · период
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {typeBreakdown.map((t) => {
            const Icon = TYPE_META[t.type].icon;
            const share = totals.revenue > 0 ? (t.revenue / totals.revenue) * 100 : 0;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => setTypeDrill(t.type)}
                className="text-left relative overflow-hidden rounded-2xl glass-card p-5 shadow-elegant transition-all hover:shadow-elevated hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
              >
                <div
                  className="absolute -top-16 -right-16 h-32 w-32 rounded-full opacity-25 blur-3xl"
                  style={{ backgroundColor: t.color }}
                />
                <div className="relative flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-glow"
                    style={{ backgroundColor: t.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: t.color }}>
                      {t.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.count} партий · доля {share.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="relative mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">
                      Выручка
                    </p>
                    <p className="font-bold tabular-nums">{fmtUSD(t.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">
                      Расходы
                    </p>
                    <p className="font-bold tabular-nums">{fmtUSD(t.expense)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">
                      Прибыль
                    </p>
                    <p
                      className={cn(
                        "font-bold tabular-nums",
                        t.profit >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {fmtUSD(t.profit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">
                      Маржа
                    </p>
                    <p
                      className={cn(
                        "font-bold tabular-nums",
                        t.margin >= 15 ? "text-success" : t.margin >= 5 ? "text-warning" : "text-destructive"
                      )}
                    >
                      {t.margin.toFixed(2)}%
                    </p>
                  </div>
                </div>
                {/* доля‑бар */}
                <div className="relative mt-3 h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${share}%`, backgroundColor: t.color }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* География */}
      {countryBreakdown.length > 0 && (
        <SectionCard
          title="География · агрегат за период"
          description={
            typeFilter === "ALL"
              ? "Объёмы по странам по всем типам"
              : `Объёмы по странам · ${TYPE_META[typeFilter as PartyType].label}`
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart
                  data={countryBreakdown}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  layout="vertical"
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickFormatter={(v) => fmtNum(v, 0)}
                  />
                  <YAxis
                    type="category"
                    dataKey="country"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${fmtNum(v, 0)} шт`, "Штук"]}
                  />
                  <Bar
                    dataKey="pcs"
                    name="Штук"
                    radius={[0, 6, 6, 0]}
                    cursor="pointer"
                    onClick={(d: { country?: string }) => d?.country && setCountryDrill(d.country)}
                  >
                    {countryBreakdown.map((c, i) => (
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
              {countryBreakdown.map((c) => {
                const totalPcs = countryBreakdown.reduce((s, r) => s + r.pcs, 0);
                const share = totalPcs > 0 ? (c.pcs / totalPcs) * 100 : 0;
                const color = COUNTRY_COLORS[c.country] ?? "var(--primary)";
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
                        {c.country}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmtNum(c.pcs, 0)} шт · {fmtNum(c.kg, 1)} кг
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, backgroundColor: color }} />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{share.toFixed(1)}% от объёма · нажмите для деталей</p>
                  </button>
                );
              })}
            </div>
          </div>
        </SectionCard>
      )}


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
          periodKind="week"
          data={volumeWeeklyData}
          countries={(() => {
            const set = new Set<string>();
            volumeWeeklyData.forEach((d) => Object.keys(d.byCountry).forEach((k) => set.add(k)));
            return Array.from(set).sort().map((cc) => ({
              key: cc,
              label: cc,
              color: COUNTRY_COLORS[cc] ?? "var(--primary)",
            }));
          })()}
          types={(["CAINIAO", "MPO", "MKO"] as PartyType[]).map((t) => ({
            key: t,
            label: TYPE_META[t].label,
            color: TYPE_META[t].color,
          }))}
          onKpiClick={(k) => setVolumeKpiDrill(k)}
          onPeriodClick={(label) => {
            const m = label.match(/W(\d+)/);
            if (m) setPeriodDrill(Number(m[1]));
          }}
          onMatrixCellClick={(country, type) => setMatrixDrill({ country, type: type as PartyType })}
        />
      </section>

      {/* Топ-10 партий */}
      <SectionCard
        title="Топ‑10 партий по прибыли"
        description={typeFilter === "ALL" ? "За весь период" : `Только ${TYPE_META[typeFilter as PartyType].label}`}
      >
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Партия</th>
                <th className="px-3 py-2 font-semibold">Тип</th>
                <th className="px-3 py-2 font-semibold">Неделя</th>
                <th className="px-3 py-2 font-semibold text-right">Выручка</th>
                <th className="px-3 py-2 font-semibold text-right">Прибыль</th>
                <th className="px-3 py-2 font-semibold text-right">Маржа</th>
              </tr>
            </thead>
            <tbody>
              {topParties.map((p, i) => {
                const meta = TYPE_META[p.type];
                return (
                  <tr key={p.col} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 text-xs font-bold text-muted-foreground tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{p.num}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
                          color: meta.color,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">W{p._week}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(p.revenue)}</td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-bold tabular-nums",
                        p.gross_profit >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {fmtUSD(p.gross_profit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.margin_pct != null ? (
                        <span
                          className={cn(
                            "font-semibold",
                            p.margin_pct >= 15
                              ? "text-success"
                              : p.margin_pct >= 5
                                ? "text-warning"
                                : "text-destructive"
                          )}
                        >
                          {p.margin_pct.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Таблица недель */}
      <SectionCard title="Сводная таблица по неделям" description="Все 16 недель в одной матрице">
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Неделя</th>
                <th className="px-3 py-2 font-semibold">Период</th>
                <th className="px-3 py-2 font-semibold text-right">Партий</th>
                <th className="px-3 py-2 font-semibold text-right">Выручка</th>
                <th className="px-3 py-2 font-semibold text-right">Расходы</th>
                <th className="px-3 py-2 font-semibold text-right">Прибыль</th>
                <th className="px-3 py-2 font-semibold text-right">Маржа</th>
              </tr>
            </thead>
            <tbody>
              {weeklySeries.map((w) => (
                <tr key={w.week} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-semibold">W{w.week}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{w.period}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{w.parties}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(w.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {fmtUSD(w.expense)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-bold tabular-nums",
                      w.gross_profit >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {fmtUSD(w.gross_profit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span
                      className={cn(
                        "font-semibold",
                        w.margin_pct >= 15
                          ? "text-success"
                          : w.margin_pct >= 5
                            ? "text-warning"
                            : "text-destructive"
                      )}
                    >
                      {w.margin_pct.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-bold">
                <td className="px-3 py-2">Σ</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">Итого</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.partiesTotal}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.expense)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success">
                  {fmtUSD(totals.gross_profit)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.margin.toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
        <Activity className="h-3.5 w-3.5" />
        <Boxes className="h-3.5 w-3.5" />
        Аналитика построена по {sortedWeeks.length} неделям · фильтр: {typeFilter === "ALL" ? "Все типы" : TYPE_META[typeFilter as PartyType].label}
      </div>
    </div>

    {/* Drill-down dialog для KPI карточек "Общего свода" */}
    <Dialog open={kpiDrill !== null} onOpenChange={(o) => !o && setKpiDrill(null)}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        {kpiDrill && kpiDrillData && (() => {
          const meta = KPI_DRILL_META[kpiDrill];
          const Icon = meta.icon;
          const { series, best, worst, byType, topParties, bottomParties, avg, partyMetric } = kpiDrillData;
          const isMargin = kpiDrill === "margin";
          const fmt = (v: number) => meta.format(v);
          return (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-white" style={{ background: meta.color }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-xl">{meta.label} · {sortedWeeks.length} нед.</DialogTitle>
                    <DialogDescription className="text-sm">{meta.description}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-2">
                {/* Сводка */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{isMargin ? "Среднее" : "Итого"}</p>
                    <p className="text-lg font-bold tabular-nums mt-1">{isMargin ? fmt(avg) : fmt(kpiDrillData.total)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Среднее/нед</p>
                    <p className="text-lg font-bold tabular-nums mt-1">{fmt(avg)}</p>
                  </div>
                  {best && (
                    <div className="rounded-xl bg-success/10 border border-success/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-success font-semibold">Лучшая · {best.label}</p>
                      <p className="text-lg font-bold tabular-nums mt-1 text-success">{fmt(best.value)}</p>
                    </div>
                  )}
                  {worst && (
                    <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-destructive font-semibold">Худшая · {worst.label}</p>
                      <p className="text-lg font-bold tabular-nums mt-1 text-destructive">{fmt(worst.value)}</p>
                    </div>
                  )}
                </div>

                {/* График по неделям */}
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Динамика по неделям</p>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <ComposedChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="kpi-drill-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={meta.color} stopOpacity={0.5} />
                            <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v) => isMargin ? `${v.toFixed(0)}%` : `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                          formatter={(v: number) => [fmt(v), meta.label]}
                          labelFormatter={(l, payload) => {
                            const p = payload?.[0]?.payload as { period?: string } | undefined;
                            return `${l}${p?.period ? ` · ${p.period}` : ""}`;
                          }}
                        />
                        <ReferenceLine y={avg} stroke={meta.color} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "среднее", fill: "var(--muted-foreground)", fontSize: 10, position: "right" }} />
                        <Area type="monotone" dataKey="value" stroke={meta.color} strokeWidth={2} fill="url(#kpi-drill-grad)" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* По типам */}
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Разбивка по типам бизнеса</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {byType.map((t) => {
                      const TypeIcon = TYPE_META[t.type].icon;
                      return (
                        <div key={t.type} className="rounded-xl border border-border bg-card/60 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white" style={{ background: t.color }}>
                              <TypeIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{t.label}</p>
                              <p className="text-[10px] text-muted-foreground">{t.count} партий</p>
                            </div>
                          </div>
                          <p className="text-xl font-bold tabular-nums">{fmt(t.value)}</p>
                          {!isMargin && (
                            <div className="mt-2">
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${t.share}%`, background: t.color }} />
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1">{t.share.toFixed(1)}% от итого</p>
                            </div>
                          )}
                          <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                            <span>Выручка: <b className="text-foreground tabular-nums">{fmtUSD(t.revenue)}</b></span>
                            <span>Маржа: <b className="text-foreground tabular-nums">{t.margin_pct.toFixed(1)}%</b></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Топ партий */}
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Топ-10 партий по {meta.label.toLowerCase()}
                    {typeFilter !== "ALL" && <span className="ml-1 text-[10px] normal-case">· фильтр: {TYPE_META[typeFilter as PartyType].label}</span>}
                  </p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Партия</th>
                          <th className="px-3 py-2 text-left">Тип</th>
                          <th className="px-3 py-2 text-left">Неделя</th>
                          <th className="px-3 py-2 text-right">{meta.label}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topParties.map(({ p, week, period }, i) => (
                          <tr key={`${p.col}-${week}`} className="border-t border-border/50 hover:bg-muted/30">
                            <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                            <td className="px-3 py-2 font-mono">{p.col}</td>
                            <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white" style={{ background: TYPE_META[p.type].color }}>{TYPE_META[p.type].label}</span></td>
                            <td className="px-3 py-2 text-muted-foreground">W{week} · {period}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(partyMetric(p))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Антирейтинг */}
                {bottomParties.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-destructive font-semibold mb-2">Антирейтинг · 5 худших</p>
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 overflow-hidden">
                      <table className="w-full text-xs">
                        <tbody>
                          {bottomParties.map(({ p, week, period }, i) => (
                            <tr key={`${p.col}-${week}`} className="border-t border-destructive/20 first:border-t-0">
                              <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                              <td className="px-3 py-2 font-mono">{p.col}</td>
                              <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white" style={{ background: TYPE_META[p.type].color }}>{TYPE_META[p.type].label}</span></td>
                              <td className="px-3 py-2 text-muted-foreground">W{week} · {period}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold text-destructive">{fmt(partyMetric(p))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>

    <CountryDetailDialog
      open={!!countryDrill}
      onOpenChange={(o) => !o && setCountryDrill(null)}
      data={countryDetailData}
    />

    {/* ===== Drill: Тип бизнеса ===== */}
    <Dialog open={typeDrill !== null} onOpenChange={(o) => !o && setTypeDrill(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {typeDrill && (() => {
          const t = typeBreakdown.find((x) => x.type === typeDrill)!;
          const meta = TYPE_META[typeDrill];
          const Icon = meta.icon;
          // динамика по неделям для этого типа
          const series = sortedWeeks.map((w) => {
            const ps = w.parties.filter((p) => p.type === typeDrill);
            const r = ps.reduce((s, p) => s + (p.revenue ?? 0), 0);
            const e = ps.reduce((s, p) => s + (p.expense ?? 0), 0);
            const gp = r - e;
            const pcs = ps.reduce((s, p) => {
              const mixPcs = (p.mix ?? []).reduce((ss, m) => ss + (m.pcs ?? 0), 0);
              return s + (typeof p.total_pcs === "number" ? p.total_pcs : mixPcs);
            }, 0);
            return {
              label: `W${w.week}`,
              period: w.period,
              revenue: r,
              expense: e,
              gross_profit: gp,
              margin_pct: r > 0 ? (gp / r) * 100 : 0,
              pcs,
              parties: ps.length,
            };
          });
          // топ-партий
          const partiesAll = sortedWeeks.flatMap((w) =>
            w.parties.filter((p) => p.type === typeDrill).map((p) => ({ ...p, _week: w.week }))
          );
          const top = [...partiesAll].sort((a, b) => b.gross_profit - a.gross_profit).slice(0, 8);
          // география
          const cMap = new Map<string, { pcs: number; kg: number }>();
          partiesAll.forEach((p) =>
            (p.mix ?? []).forEach((m) => {
              const cur = cMap.get(m.country) ?? { pcs: 0, kg: 0 };
              cur.pcs += m.pcs ?? 0;
              cur.kg += m.kg ?? 0;
              cMap.set(m.country, cur);
            })
          );
          const geo = Array.from(cMap.entries())
            .map(([k, v]) => ({ country: k, ...v }))
            .sort((a, b) => b.pcs - a.pcs);
          const totalPcs = geo.reduce((s, r) => s + r.pcs, 0);
          return (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-white" style={{ background: t.color }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-xl">{meta.full}</DialogTitle>
                    <DialogDescription>
                      {t.count} партий · доля выручки {((t.revenue / totals.revenue) * 100).toFixed(1)}% · {sortedWeeks.length} нед.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-6 mt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Выручка</p>
                    <p className="text-lg font-bold tabular-nums mt-1">{fmtUSD(t.revenue)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Расходы</p>
                    <p className="text-lg font-bold tabular-nums mt-1">{fmtUSD(t.expense)}</p>
                  </div>
                  <div className={cn("rounded-xl border p-3", t.profit >= 0 ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30")}>
                    <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: t.profit >= 0 ? "var(--success)" : "var(--destructive)" }}>Прибыль</p>
                    <p className={cn("text-lg font-bold tabular-nums mt-1", t.profit >= 0 ? "text-success" : "text-destructive")}>{fmtUSD(t.profit)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Маржа</p>
                    <p className={cn("text-lg font-bold tabular-nums mt-1", t.margin >= 15 ? "text-success" : t.margin >= 5 ? "text-warning" : "text-destructive")}>{t.margin.toFixed(2)}%</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Динамика по неделям · выручка vs расходы</p>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <ComposedChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="var(--warning)" tickFormatter={(v) => `${v.toFixed(0)}%`} />
                        <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} formatter={(v: number, n: string) => n === "Маржа %" ? [`${v.toFixed(2)}%`, n] : [fmtUSD(v), n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="left" dataKey="revenue" name="Выручка" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="left" dataKey="expense" name="Расходы" fill="var(--destructive)" radius={[4, 4, 0, 0]} opacity={0.6} />
                        <Line yAxisId="right" type="monotone" dataKey="margin_pct" name="Маржа %" stroke="var(--warning)" strokeWidth={2.5} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {geo.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">География · {meta.label}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {geo.map((g) => {
                        const share = totalPcs > 0 ? (g.pcs / totalPcs) * 100 : 0;
                        const color = COUNTRY_COLORS[g.country] ?? "var(--primary)";
                        return (
                          <div key={g.country} className="rounded-lg border border-border/60 bg-card/40 p-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold inline-flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{g.country}
                              </span>
                              <span className="text-muted-foreground tabular-nums">{share.toFixed(1)}%</span>
                            </div>
                            <p className="text-sm font-bold tabular-nums mt-1">{fmtNum(g.pcs, 0)} шт</p>
                            <p className="text-[10px] text-muted-foreground tabular-nums">{fmtNum(g.kg, 1)} кг</p>
                            <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Топ-8 партий по прибыли · {meta.label}</p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Партия</th>
                          <th className="px-3 py-2 text-left">Неделя</th>
                          <th className="px-3 py-2 text-right">Выручка</th>
                          <th className="px-3 py-2 text-right">Прибыль</th>
                          <th className="px-3 py-2 text-right">Маржа</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((p, i) => (
                          <tr key={`${p.col}-${p._week}`} className="border-t border-border/50 hover:bg-muted/30">
                            <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                            <td className="px-3 py-2 font-mono">{p.num}</td>
                            <td className="px-3 py-2 text-muted-foreground">W{p._week}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(p.revenue)}</td>
                            <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", p.gross_profit >= 0 ? "text-success" : "text-destructive")}>{fmtUSD(p.gross_profit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.margin_pct != null ? `${p.margin_pct.toFixed(1)}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>

    {/* ===== Drill: Volume KPI ===== */}
    <Dialog open={volumeKpiDrill !== null} onOpenChange={(o) => !o && setVolumeKpiDrill(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {volumeKpiDrill && (() => {
          const labels: Record<typeof volumeKpiDrill, { title: string; desc: string; color: string }> = {
            pcs: { title: "Σ Штук · детально", desc: "Общий объём отправлений за период с разбивкой по неделям и странам.", color: "var(--primary)" },
            kg: { title: "Σ Килограмм · детально", desc: "Общий вес посылок за период с разбивкой по неделям и странам.", color: "var(--mpo)" },
            avgw: { title: "Средний вес посылки · детально", desc: "Средний вес одной посылки (граммов) по неделям.", color: "var(--mko)" },
            rev_per_pcs: { title: "Выручка / штука · детально", desc: "Средний чек выручки на одну посылку по неделям.", color: "var(--success)" },
          } as const;
          const lab = labels[volumeKpiDrill];
          const series = volumeWeeklyData.map((d) => {
            const pcs = d.pcs;
            const kg = d.kg;
            const value =
              volumeKpiDrill === "pcs" ? pcs :
              volumeKpiDrill === "kg" ? kg :
              volumeKpiDrill === "avgw" ? (pcs > 0 ? (kg * 1000) / pcs : 0) :
              (pcs > 0 ? d.revenue / pcs : 0);
            return { label: d.label, period: d.period, value, pcs, kg, revenue: d.revenue };
          });
          const fmt = (v: number) =>
            volumeKpiDrill === "pcs" ? `${fmtNum(v, 0)} шт` :
            volumeKpiDrill === "kg" ? `${fmtNum(v, 1)} кг` :
            volumeKpiDrill === "avgw" ? `${fmtNum(v, 0)} г` :
            fmtUSD(v);
          const total = series.reduce((s, r) => s + r.value, 0);
          const avg = series.length > 0 ? total / series.length : 0;
          const sorted = [...series].sort((a, b) => b.value - a.value);
          const best = sorted[0];
          const worst = sorted[sorted.length - 1];
          // По странам — агрегат
          const byC = new Map<string, { pcs: number; kg: number; revenue: number }>();
          volumeWeeklyData.forEach((d) =>
            Object.entries(d.byCountry).forEach(([k, v]) => {
              const cur = byC.get(k) ?? { pcs: 0, kg: 0, revenue: 0 };
              cur.pcs += v.pcs; cur.kg += v.kg; cur.revenue += v.revenue;
              byC.set(k, cur);
            })
          );
          const geo = Array.from(byC.entries()).map(([k, v]) => {
            const value =
              volumeKpiDrill === "pcs" ? v.pcs :
              volumeKpiDrill === "kg" ? v.kg :
              volumeKpiDrill === "avgw" ? (v.pcs > 0 ? (v.kg * 1000) / v.pcs : 0) :
              (v.pcs > 0 ? v.revenue / v.pcs : 0);
            return { country: k, value, ...v };
          }).sort((a, b) => b.value - a.value);
          const isAggregate = volumeKpiDrill === "pcs" || volumeKpiDrill === "kg";
          return (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{lab.title}</DialogTitle>
                <DialogDescription>{lab.desc}</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 mt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{isAggregate ? "Итого" : "Среднее"}</p>
                    <p className="text-lg font-bold tabular-nums mt-1">{isAggregate ? fmt(total) : fmt(avg)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Среднее/нед</p>
                    <p className="text-lg font-bold tabular-nums mt-1">{fmt(avg)}</p>
                  </div>
                  {best && (
                    <div className="rounded-xl bg-success/10 border border-success/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-success font-semibold">Лучшая · {best.label}</p>
                      <p className="text-lg font-bold tabular-nums mt-1 text-success">{fmt(best.value)}</p>
                    </div>
                  )}
                  {worst && (
                    <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-destructive font-semibold">Худшая · {worst.label}</p>
                      <p className="text-lg font-bold tabular-nums mt-1 text-destructive">{fmt(worst.value)}</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Динамика по неделям</p>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <BarChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                        <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [fmt(v), lab.title]} />
                        <ReferenceLine y={avg} stroke={lab.color} strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "среднее", fill: "var(--muted-foreground)", fontSize: 10, position: "right" }} />
                        <Bar dataKey="value" fill={lab.color} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Разбивка по странам</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {geo.map((g) => {
                      const share = isAggregate && total > 0 ? (g.value / total) * 100 : 0;
                      const color = COUNTRY_COLORS[g.country] ?? "var(--primary)";
                      return (
                        <div key={g.country} className="rounded-lg border border-border/60 bg-card/40 p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold inline-flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{g.country}
                            </span>
                            {isAggregate && <span className="text-muted-foreground tabular-nums">{share.toFixed(1)}%</span>}
                          </div>
                          <p className="text-sm font-bold tabular-nums mt-1">{fmt(g.value)}</p>
                          {isAggregate && (
                            <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>

    {/* ===== Drill: Период (неделя из stacked) ===== */}
    <Dialog open={periodDrill !== null} onOpenChange={(o) => !o && setPeriodDrill(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {periodDrill !== null && weeksMap[periodDrill] && (() => {
          const w = weeksMap[periodDrill];
          const filtered = typeFilter === "ALL" ? w.parties : w.parties.filter((p) => p.type === typeFilter);
          const rev = filtered.reduce((s, p) => s + (p.revenue ?? 0), 0);
          const exp = filtered.reduce((s, p) => s + (p.expense ?? 0), 0);
          const gp = rev - exp;
          const pcs = filtered.reduce((s, p) => {
            const mp = (p.mix ?? []).reduce((ss, m) => ss + (m.pcs ?? 0), 0);
            return s + (typeof p.total_pcs === "number" ? p.total_pcs : mp);
          }, 0);
          const kg = filtered.reduce((s, p) => s + (p.mix ?? []).reduce((ss, m) => ss + (m.kg ?? 0), 0), 0);
          // Страны
          const cMap = new Map<string, { pcs: number; kg: number }>();
          filtered.forEach((p) => (p.mix ?? []).forEach((m) => {
            const cur = cMap.get(m.country) ?? { pcs: 0, kg: 0 };
            cur.pcs += m.pcs ?? 0; cur.kg += m.kg ?? 0;
            cMap.set(m.country, cur);
          }));
          const geo = Array.from(cMap.entries()).map(([k, v]) => ({ country: k, ...v })).sort((a, b) => b.pcs - a.pcs);
          // Типы
          const typesAgg = (["CAINIAO", "MPO", "MKO"] as PartyType[]).map((t) => {
            const ps = w.parties.filter((p) => p.type === t);
            const r = ps.reduce((s, p) => s + (p.revenue ?? 0), 0);
            const e = ps.reduce((s, p) => s + (p.expense ?? 0), 0);
            return { type: t, count: ps.length, revenue: r, expense: e, profit: r - e, margin: r > 0 ? ((r - e) / r) * 100 : 0 };
          });
          return (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Неделя W{w.week}</DialogTitle>
                <DialogDescription>{w.period} · {filtered.length} партий{typeFilter !== "ALL" ? ` · ${TYPE_META[typeFilter as PartyType].label}` : ""}</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 mt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Выручка</p><p className="text-lg font-bold tabular-nums mt-1">{fmtUSD(rev)}</p></div>
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Расходы</p><p className="text-lg font-bold tabular-nums mt-1">{fmtUSD(exp)}</p></div>
                  <div className={cn("rounded-xl border p-3", gp >= 0 ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30")}><p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: gp >= 0 ? "var(--success)" : "var(--destructive)" }}>Прибыль</p><p className={cn("text-lg font-bold tabular-nums mt-1", gp >= 0 ? "text-success" : "text-destructive")}>{fmtUSD(gp)}</p></div>
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Объём</p><p className="text-lg font-bold tabular-nums mt-1">{fmtNum(pcs, 0)} шт</p><p className="text-[10px] text-muted-foreground tabular-nums">{fmtNum(kg, 1)} кг</p></div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">По типам бизнеса</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {typesAgg.map((tt) => {
                      const TIcon = TYPE_META[tt.type].icon;
                      return (
                        <div key={tt.type} className="rounded-xl border border-border bg-card/60 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white" style={{ background: TYPE_META[tt.type].color }}><TIcon className="h-4 w-4" /></div>
                            <div><p className="text-sm font-semibold">{TYPE_META[tt.type].label}</p><p className="text-[10px] text-muted-foreground">{tt.count} партий</p></div>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[11px]">
                            <span className="text-muted-foreground">Выручка</span><span className="text-right tabular-nums font-semibold">{fmtUSD(tt.revenue)}</span>
                            <span className="text-muted-foreground">Прибыль</span><span className={cn("text-right tabular-nums font-semibold", tt.profit >= 0 ? "text-success" : "text-destructive")}>{fmtUSD(tt.profit)}</span>
                            <span className="text-muted-foreground">Маржа</span><span className={cn("text-right tabular-nums font-semibold", tt.margin >= 15 ? "text-success" : tt.margin >= 5 ? "text-warning" : "text-destructive")}>{tt.margin.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {geo.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">По странам</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {geo.map((g) => {
                        const share = pcs > 0 ? (g.pcs / pcs) * 100 : 0;
                        const color = COUNTRY_COLORS[g.country] ?? "var(--primary)";
                        return (
                          <div key={g.country} className="rounded-lg border border-border/60 bg-card/40 p-3">
                            <div className="flex items-center justify-between text-xs"><span className="font-semibold inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{g.country}</span><span className="text-muted-foreground tabular-nums">{share.toFixed(1)}%</span></div>
                            <p className="text-sm font-bold tabular-nums mt-1">{fmtNum(g.pcs, 0)} шт</p>
                            <p className="text-[10px] text-muted-foreground tabular-nums">{fmtNum(g.kg, 1)} кг</p>
                            <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Все партии недели</p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr><th className="px-3 py-2 text-left">Партия</th><th className="px-3 py-2 text-left">Тип</th><th className="px-3 py-2 text-right">Выручка</th><th className="px-3 py-2 text-right">Прибыль</th><th className="px-3 py-2 text-right">Маржа</th></tr>
                      </thead>
                      <tbody>
                        {filtered.map((p) => (
                          <tr key={p.col} className="border-t border-border/50 hover:bg-muted/30">
                            <td className="px-3 py-2 font-mono">{p.num}</td>
                            <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white" style={{ background: TYPE_META[p.type].color }}>{TYPE_META[p.type].label}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(p.revenue)}</td>
                            <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", p.gross_profit >= 0 ? "text-success" : "text-destructive")}>{fmtUSD(p.gross_profit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.margin_pct != null ? `${p.margin_pct.toFixed(1)}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>

    {/* ===== Drill: Ячейка матрицы Страна × Тип ===== */}
    <Dialog open={matrixDrill !== null} onOpenChange={(o) => !o && setMatrixDrill(null)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {matrixDrill && (() => {
          const { country, type } = matrixDrill;
          const tMeta = TYPE_META[type];
          const cColor = COUNTRY_COLORS[country] ?? "var(--primary)";
          // Та же аллокация, что и в матрице VolumeAndBreakdown:
          // для каждого периода — берём итог типа за период и распределяем
          // на страну пропорционально доле страны в выручке/штуках периода.
          const series = volumeWeeklyData.map((d) => {
            const tv = d.byType[type];
            const cv = d.byCountry[country];
            if (!tv || !cv) {
              return { label: d.label, period: d.period, pcs: 0, kg: 0, revenue: 0, expense: 0, gross_profit: 0, margin_pct: 0 };
            }
            const periodCountryRev = Object.values(d.byCountry).reduce((s, v) => s + (v.revenue ?? 0), 0);
            const cShareRev = periodCountryRev > 0 ? cv.revenue / periodCountryRev : 0;
            const cSharePcs = d.pcs > 0 ? cv.pcs / d.pcs : 0;
            const rev = (tv.revenue ?? 0) * cShareRev;
            const exp = (tv.expense ?? 0) * cShareRev;
            const pcs = (tv.pcs ?? 0) * cSharePcs;
            const kg = (tv.kg ?? 0) * cSharePcs;
            return {
              label: d.label,
              period: d.period,
              pcs: Math.round(pcs),
              kg: Math.round(kg * 10) / 10,
              revenue: Math.round(rev),
              expense: Math.round(exp),
              gross_profit: Math.round(rev - exp),
              margin_pct: rev > 0 ? ((rev - exp) / rev) * 100 : 0,
            };
          }).filter((r) => r.pcs > 0 || r.revenue > 0);
          const totalRev = series.reduce((s, r) => s + r.revenue, 0);
          const totalExp = series.reduce((s, r) => s + r.expense, 0);
          const totalGp = totalRev - totalExp;
          const totalPcs = series.reduce((s, r) => s + r.pcs, 0);
          const totalKg = series.reduce((s, r) => s + r.kg, 0);
          const margin = totalRev > 0 ? (totalGp / totalRev) * 100 : 0;
          return (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cColor }} />{country}
                  <span className="text-muted-foreground">×</span>
                  <span className="px-2 py-0.5 rounded text-sm font-bold text-white" style={{ background: tMeta.color }}>{tMeta.label}</span>
                </DialogTitle>
                <DialogDescription>Расчётная аллокация типа {tMeta.label} на страну {country} пропорционально доле штук страны в каждой партии.</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 mt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Выручка</p><p className="text-lg font-bold tabular-nums mt-1">{fmtUSD(totalRev)}</p></div>
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Расходы</p><p className="text-lg font-bold tabular-nums mt-1">{fmtUSD(totalExp)}</p></div>
                  <div className={cn("rounded-xl border p-3", totalGp >= 0 ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30")}><p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: totalGp >= 0 ? "var(--success)" : "var(--destructive)" }}>Прибыль</p><p className={cn("text-lg font-bold tabular-nums mt-1", totalGp >= 0 ? "text-success" : "text-destructive")}>{fmtUSD(totalGp)}</p><p className="text-[10px] text-muted-foreground tabular-nums">маржа {margin.toFixed(2)}%</p></div>
                  <div className="rounded-xl bg-muted/40 border border-border/60 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Объём</p><p className="text-lg font-bold tabular-nums mt-1">{fmtNum(totalPcs, 0)} шт</p><p className="text-[10px] text-muted-foreground tabular-nums">{fmtNum(totalKg, 1)} кг</p></div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Динамика по неделям</p>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <ComposedChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="var(--warning)" tickFormatter={(v) => `${v.toFixed(0)}%`} />
                        <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} formatter={(v: number, n: string) => n === "Маржа %" ? [`${v.toFixed(2)}%`, n] : [fmtUSD(v), n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="left" dataKey="revenue" name="Выручка" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="left" dataKey="expense" name="Расходы" fill="var(--destructive)" radius={[4, 4, 0, 0]} opacity={0.6} />
                        <Line yAxisId="right" type="monotone" dataKey="margin_pct" name="Маржа %" stroke="var(--warning)" strokeWidth={2.5} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Понедельная разбивка</p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr><th className="px-3 py-2 text-left">Неделя</th><th className="px-3 py-2 text-right">Шт</th><th className="px-3 py-2 text-right">Кг</th><th className="px-3 py-2 text-right">Выручка</th><th className="px-3 py-2 text-right">Прибыль</th><th className="px-3 py-2 text-right">Маржа</th></tr>
                      </thead>
                      <tbody>
                        {series.map((r) => (
                          <tr key={r.label} className="border-t border-border/50 hover:bg-muted/30">
                            <td className="px-3 py-2 font-semibold">{r.label}<span className="ml-1 text-[10px] text-muted-foreground">{r.period}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.pcs, 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.kg, 1)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(r.revenue)}</td>
                            <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", r.gross_profit >= 0 ? "text-success" : "text-destructive")}>{fmtUSD(r.gross_profit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.margin_pct.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}
