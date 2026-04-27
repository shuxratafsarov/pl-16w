import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  ArrowRight,
  Search,
  Calculator,
  Boxes,
  Plane,
  PackageCheck,
  Banknote,
  Info,
  Equal,
  type LucideIcon,
} from "lucide-react";
import type { Party, PartyType, WeekData } from "@/lib/types";
import { fmtUSD, fmtNum } from "@/lib/format";
import { SectionCard } from "@/components/SectionCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ============ Загрузка данных ============ */

const WEEK_MODULES = import.meta.glob("@/data/week*.json", {
  eager: true,
  import: "default",
}) as Record<string, WeekData>;
const ALL_WEEKS: Record<number, WeekData> = {};
for (const path in WEEK_MODULES) {
  const m = path.match(/week(\d+)\.json$/);
  if (m) ALL_WEEKS[Number(m[1])] = WEEK_MODULES[path];
}
const AVAILABLE_WEEKS = Object.keys(ALL_WEEKS)
  .map(Number)
  .sort((a, b) => a - b);
const DEFAULT_WEEK = AVAILABLE_WEEKS[AVAILABLE_WEEKS.length - 1] ?? 16;
const OVERVIEW_KEY = 0;

/* ============ Меты типов ============ */

const TYPE_META: Record<
  PartyType,
  { label: string; full: string; color: string; icon: LucideIcon }
> = {
  CAINIAO: {
    label: "CAINIAO",
    full: "Cainiao C2M · авиа Китай→UZ",
    color: "var(--cainiao)",
    icon: Plane,
  },
  MPO: {
    label: "UZUM MPO",
    full: "UZUM Crossborder · MPO",
    color: "var(--mpo)",
    icon: PackageCheck,
  },
  MKO: {
    label: "UZUM MKO",
    full: "UZUM Crossborder · MKO",
    color: "var(--mko)",
    icon: Banknote,
  },
};

/* ============ Логика проверки ============ */

/** Допуск сравнения чисел, которые в источнике округлены до 2-3 знаков. */
const EPS_USD = 0.5;
const EPS_RATIO = 0.005; // ±0.005x для марк. 2/3
const EPS_TARIFF = 0.05; // ±0.05 $/кг для марк. 1
const EPS_MARGIN = 0.5; // ±0.5% для марк. 4

type Severity = "ok" | "warn" | "error" | "na";

type FieldCheck = {
  label: string;
  formula: string;
  source: number | null;
  computed: number | null;
  delta: number | null;
  severity: Severity;
  unit: string;
  decimals: number;
};

type PartyAudit = {
  weekN: number;
  partyId: string; // уникальный
  origCol: string;
  num: string;
  type: PartyType;
  date: string | null;
  /** Источник revenue (лист revenue). */
  revenue: number;
  /** Источник expense (лист expenses). */
  expense: number;
  /** Контрольная пара GP = Rev − Exp. */
  gpCheck: FieldCheck;
  /** Контроль маржи: (GP / Rev) × 100. */
  marginCheck: FieldCheck;
  /** M1: тариф = expense / total_kg. */
  m1Check: FieldCheck;
  /** M2: weight_vol / weight_net. */
  m2Check: FieldCheck;
  /** M3: weight_gross / weight_net. */
  m3Check: FieldCheck;
  /** Итоговый статус по партии. */
  status: Severity;
  errors: number;
  warnings: number;
};

function classify(
  source: number | null,
  computed: number | null,
  eps: number
): { severity: Severity; delta: number | null } {
  if (source == null && computed == null)
    return { severity: "na", delta: null };
  if (source == null || computed == null)
    return { severity: "warn", delta: null };
  const delta = computed - source;
  const abs = Math.abs(delta);
  if (abs <= eps) return { severity: "ok", delta };
  if (abs <= eps * 4) return { severity: "warn", delta };
  return { severity: "error", delta };
}

function buildPartyAudit(p: Party, weekN: number): PartyAudit {
  const safeNum = (v: number | null | undefined): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const rev = p.revenue ?? 0;
  const exp = p.expense ?? 0;

  // GP контроль: revenue − expense
  const gpComputed = rev - exp;
  const gpRes = classify(safeNum(p.gross_profit), gpComputed, EPS_USD);
  const gpCheck: FieldCheck = {
    label: "GP = Revenue − Expense",
    formula: `${fmtUSD(rev, 2)} − ${fmtUSD(exp, 2)}`,
    source: safeNum(p.gross_profit),
    computed: gpComputed,
    delta: gpRes.delta,
    severity: gpRes.severity,
    unit: "$",
    decimals: 2,
  };

  // Маржа: (GP / Rev) × 100
  const marginComputed = rev > 0 ? (gpComputed / rev) * 100 : null;
  const marginRes = classify(safeNum(p.margin_pct), marginComputed, EPS_MARGIN);
  const marginCheck: FieldCheck = {
    label: "Margin% = GP / Revenue × 100",
    formula: rev > 0 ? `${fmtUSD(gpComputed, 2)} / ${fmtUSD(rev, 2)} × 100` : "—",
    source: safeNum(p.margin_pct),
    computed: marginComputed,
    delta: marginRes.delta,
    severity: marginRes.severity,
    unit: "%",
    decimals: 2,
  };

  // M1: тариф = expense / total_kg
  const totalKg = safeNum(p.total_kg);
  const m1Computed = totalKg && totalKg > 0 ? exp / totalKg : null;
  const m1Res = classify(safeNum(p.marker1_tariff), m1Computed, EPS_TARIFF);
  const m1Check: FieldCheck = {
    label: "M1 · Тариф = Expense / Total kg",
    formula: totalKg
      ? `${fmtUSD(exp, 2)} / ${fmtNum(totalKg, 2)} кг`
      : "нет total_kg",
    source: safeNum(p.marker1_tariff),
    computed: m1Computed,
    delta: m1Res.delta,
    severity: m1Res.severity,
    unit: " $/кг",
    decimals: 2,
  };

  // M2: weight_vol / weight_net
  const wn = safeNum(p.weight_net);
  const wv = safeNum(p.weight_vol);
  const m2Computed = wn && wn > 0 && wv != null ? wv / wn : null;
  const m2Res = classify(safeNum(p.marker2_volnet), m2Computed, EPS_RATIO);
  const m2Check: FieldCheck = {
    label: "M2 · Vol / Net",
    formula: wn && wv != null ? `${fmtNum(wv, 2)} / ${fmtNum(wn, 2)} кг` : "—",
    source: safeNum(p.marker2_volnet),
    computed: m2Computed,
    delta: m2Res.delta,
    severity: m2Res.severity,
    unit: "x",
    decimals: 3,
  };

  // M3: weight_gross / weight_net
  const wg = safeNum(p.weight_gross);
  const m3Computed = wn && wn > 0 && wg != null ? wg / wn : null;
  const m3Res = classify(safeNum(p.marker3_grossnet), m3Computed, EPS_RATIO);
  const m3Check: FieldCheck = {
    label: "M3 · Gross / Net",
    formula: wn && wg != null ? `${fmtNum(wg, 2)} / ${fmtNum(wn, 2)} кг` : "—",
    source: safeNum(p.marker3_grossnet),
    computed: m3Computed,
    delta: m3Res.delta,
    severity: m3Res.severity,
    unit: "x",
    decimals: 3,
  };

  const checks = [gpCheck, marginCheck, m1Check, m2Check, m3Check];
  const errors = checks.filter((c) => c.severity === "error").length;
  const warnings = checks.filter((c) => c.severity === "warn").length;
  const status: Severity =
    errors > 0 ? "error" : warnings > 0 ? "warn" : "ok";

  return {
    weekN,
    partyId: `w${weekN}-${p.col}`,
    origCol: p.col,
    num: p.num,
    type: p.type,
    date: p.date,
    revenue: rev,
    expense: exp,
    gpCheck,
    marginCheck,
    m1Check,
    m2Check,
    m3Check,
    status,
    errors,
    warnings,
  };
}

/** Суммовая сверка по неделе: типы и зонтик UZUM CB. */
type WeekRecon = {
  scope: string;
  metric: string;
  source: number;
  computed: number;
  delta: number;
  severity: Severity;
};

function buildWeekRecon(w: WeekData): WeekRecon[] {
  const out: WeekRecon[] = [];
  const sumByType = (t: PartyType) => {
    const ps = w.parties.filter((p) => p.type === t);
    return {
      revenue: ps.reduce((s, p) => s + (p.revenue ?? 0), 0),
      expense: ps.reduce((s, p) => s + (p.expense ?? 0), 0),
      gp: ps.reduce((s, p) => s + (p.gross_profit ?? 0), 0),
    };
  };
  (["CAINIAO", "MPO", "MKO"] as PartyType[]).forEach((t) => {
    const c = sumByType(t);
    const old = w.byType?.[t];
    if (!old) return;
    const push = (metric: string, source: number, computed: number) => {
      const d = computed - source;
      const sev: Severity =
        Math.abs(d) <= EPS_USD ? "ok" : Math.abs(d) <= EPS_USD * 4 ? "warn" : "error";
      out.push({ scope: t, metric, source, computed, delta: d, severity: sev });
    };
    push(`${TYPE_META[t].label} · Σ Выручка`, old.revenue, c.revenue);
    push(`${TYPE_META[t].label} · Σ Расходы`, old.expense, c.expense);
    push(`${TYPE_META[t].label} · Σ Прибыль`, old.gross_profit, c.gp);
  });
  // TOTAL
  const tRev = w.parties.reduce((s, p) => s + (p.revenue ?? 0), 0);
  const tExp = w.parties.reduce((s, p) => s + (p.expense ?? 0), 0);
  const tGp = w.parties.reduce((s, p) => s + (p.gross_profit ?? 0), 0);
  const pushT = (metric: string, source: number, computed: number) => {
    const d = computed - source;
    const sev: Severity =
      Math.abs(d) <= EPS_USD ? "ok" : Math.abs(d) <= EPS_USD * 4 ? "warn" : "error";
    out.push({ scope: "TOTAL", metric, source, computed, delta: d, severity: sev });
  };
  pushT("TOTAL · Σ Выручка", w.totals?.revenue ?? 0, tRev);
  pushT("TOTAL · Σ Расходы", w.totals?.expense ?? 0, tExp);
  pushT("TOTAL · Σ Прибыль", w.totals?.gross_profit ?? 0, tGp);
  // UZUM CB = MPO + MKO
  const ps = w.parties.filter((p) => p.type === "MPO" || p.type === "MKO");
  const uRev = ps.reduce((s, p) => s + (p.revenue ?? 0), 0);
  const uExp = ps.reduce((s, p) => s + (p.expense ?? 0), 0);
  const uGp = ps.reduce((s, p) => s + (p.gross_profit ?? 0), 0);
  const oldU = w.umbrella_uzum_cb;
  if (oldU) {
    const pushU = (metric: string, source: number, computed: number) => {
      const d = computed - source;
      const sev: Severity =
        Math.abs(d) <= EPS_USD ? "ok" : Math.abs(d) <= EPS_USD * 4 ? "warn" : "error";
      out.push({
        scope: "UZUM CB",
        metric,
        source,
        computed,
        delta: d,
        severity: sev,
      });
    };
    pushU("UZUM CB · Σ Выручка", oldU.revenue, uRev);
    pushU("UZUM CB · Σ Расходы", oldU.expense, uExp);
    pushU("UZUM CB · Σ Прибыль", oldU.gross_profit, uGp);
  }
  return out;
}

/* ============ Маршрут ============ */

export const Route = createFileRoute("/audit")({
  component: AuditPage,
});

/* ============ UI helpers ============ */

function SeverityIcon({ s, className }: { s: Severity; className?: string }) {
  if (s === "ok")
    return <CheckCircle2 className={cn("h-3.5 w-3.5 text-success", className)} />;
  if (s === "warn")
    return <AlertTriangle className={cn("h-3.5 w-3.5 text-warning", className)} />;
  if (s === "error")
    return <XCircle className={cn("h-3.5 w-3.5 text-destructive", className)} />;
  return <Info className={cn("h-3.5 w-3.5 text-muted-foreground", className)} />;
}

function severityColor(s: Severity): string {
  return s === "ok"
    ? "text-success"
    : s === "warn"
      ? "text-warning"
      : s === "error"
        ? "text-destructive"
        : "text-muted-foreground";
}

function severityLabel(s: Severity): string {
  return s === "ok"
    ? "ok"
    : s === "warn"
      ? "внимание"
      : s === "error"
        ? "расхождение"
        : "нет данных";
}

function fmtVal(v: number | null, unit: string, decimals: number): string {
  if (v == null) return "—";
  if (unit === "$") return fmtUSD(v, decimals);
  if (unit === "%") return `${v.toFixed(decimals)}%`;
  return `${fmtNum(v, decimals)}${unit}`;
}

/* ============ Страница ============ */

function AuditPage() {
  const [selectedWeek, setSelectedWeek] = useState<number>(DEFAULT_WEEK);
  const [typeFilter, setTypeFilter] = useState<"ALL" | PartyType>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Severity>("ALL");
  const [search, setSearch] = useState("");

  const isOverview = selectedWeek === OVERVIEW_KEY;

  /** Партии для аудита — либо одна неделя, либо все недели. */
  const audits = useMemo<PartyAudit[]>(() => {
    const list: PartyAudit[] = [];
    const weeksToProcess = isOverview
      ? AVAILABLE_WEEKS.map((n) => ({ n, w: ALL_WEEKS[n] }))
      : ALL_WEEKS[selectedWeek]
        ? [{ n: selectedWeek, w: ALL_WEEKS[selectedWeek] }]
        : [];
    weeksToProcess.forEach(({ n, w }) => {
      w.parties.forEach((p) => list.push(buildPartyAudit(p, n)));
    });
    return list;
  }, [isOverview, selectedWeek]);

  /** Сверка сумм. Для общего свода — суммарно по всем неделям. */
  const recon = useMemo<WeekRecon[]>(() => {
    if (isOverview) {
      // Прогоним по всем неделям и сольём по scope+metric
      const map = new Map<string, WeekRecon>();
      AVAILABLE_WEEKS.forEach((n) => {
        const w = ALL_WEEKS[n];
        buildWeekRecon(w).forEach((r) => {
          const key = `${r.scope}::${r.metric}`;
          const cur = map.get(key);
          if (cur) {
            cur.source += r.source;
            cur.computed += r.computed;
            cur.delta = cur.computed - cur.source;
            const abs = Math.abs(cur.delta);
            cur.severity =
              abs <= EPS_USD ? "ok" : abs <= EPS_USD * 4 ? "warn" : "error";
          } else {
            map.set(key, { ...r });
          }
        });
      });
      return Array.from(map.values());
    }
    const w = ALL_WEEKS[selectedWeek];
    return w ? buildWeekRecon(w) : [];
  }, [isOverview, selectedWeek]);

  /** Применённые фильтры к таблице партий. */
  const filtered = useMemo(() => {
    return audits.filter((a) => {
      if (typeFilter !== "ALL" && a.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !a.num.toLowerCase().includes(q) &&
          !a.origCol.toLowerCase().includes(q) &&
          !`w${a.weekN}`.includes(q)
        )
          return false;
      }
      return true;
    });
  }, [audits, typeFilter, statusFilter, search]);

  /** KPI вверху. */
  const kpi = useMemo(() => {
    const total = audits.length;
    const ok = audits.filter((a) => a.status === "ok").length;
    const warn = audits.filter((a) => a.status === "warn").length;
    const err = audits.filter((a) => a.status === "error").length;
    const reconErr = recon.filter((r) => r.severity !== "ok").length;
    const totalRev = audits.reduce((s, a) => s + a.revenue, 0);
    const totalExp = audits.reduce((s, a) => s + a.expense, 0);
    return { total, ok, warn, err, reconErr, totalRev, totalExp };
  }, [audits, recon]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen">
        {/* Header */}
        <header className="border-b border-border/60 bg-card/40 backdrop-blur-xl sticky top-0 z-30">
          <div className="mx-auto max-w-[1440px] px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-11 w-11 rounded-2xl gradient-primary shadow-glow flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  3PL · Контроль данных
                </p>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
                  Проверка достоверности
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs font-semibold hover:bg-muted/60 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                К дашборду
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-6 py-8 space-y-6">
          {/* Фильтры */}
          <SectionCard
            title="Фильтры аудита"
            description="Выберите период, тип партии и/или статус. Поиск работает по номеру партии, букве колонки и неделе (например, w12)."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Период
                </label>
                <Select
                  value={String(selectedWeek)}
                  onValueChange={(v) => setSelectedWeek(Number(v))}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(OVERVIEW_KEY)}>
                      <span className="inline-flex items-center gap-1.5">
                        <Boxes className="h-3.5 w-3.5" />
                        Общий свод · {AVAILABLE_WEEKS.length} нед.
                      </span>
                    </SelectItem>
                    {AVAILABLE_WEEKS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Неделя {n} · {ALL_WEEKS[n].period}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Тип партии
                </label>
                <Select
                  value={typeFilter}
                  onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Все типы</SelectItem>
                    <SelectItem value="CAINIAO">CAINIAO</SelectItem>
                    <SelectItem value="MPO">UZUM MPO</SelectItem>
                    <SelectItem value="MKO">UZUM MKO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Статус сверки
                </label>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Все статусы</SelectItem>
                    <SelectItem value="ok">Только ok</SelectItem>
                    <SelectItem value="warn">Внимание</SelectItem>
                    <SelectItem value="error">Расхождения</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Поиск
                </label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="№ партии, w12, колонка…"
                    className="h-9 pl-8 text-xs"
                  />
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Показано <span className="font-bold text-foreground">{filtered.length}</span> из{" "}
                <span className="font-bold text-foreground">{audits.length}</span> партий
              </span>
              {(typeFilter !== "ALL" ||
                statusFilter !== "ALL" ||
                search.trim() !== "") && (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter("ALL");
                    setStatusFilter("ALL");
                    setSearch("");
                  }}
                  className="rounded-lg border border-border/60 bg-card/60 px-2 py-1 text-[11px] font-semibold hover:bg-muted/60 transition-colors"
                >
                  Сбросить фильтры
                </button>
              )}
            </div>
          </SectionCard>

          {/* KPI */}
          <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiTile
              label="Всего партий"
              value={fmtNum(kpi.total, 0)}
              icon={<Boxes className="h-4 w-4" />}
              tone="default"
            />
            <KpiTile
              label="OK"
              value={fmtNum(kpi.ok, 0)}
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
              hint={
                kpi.total > 0
                  ? `${((kpi.ok / kpi.total) * 100).toFixed(1)}% от всех`
                  : undefined
              }
            />
            <KpiTile
              label="Внимание"
              value={fmtNum(kpi.warn, 0)}
              icon={<AlertTriangle className="h-4 w-4" />}
              tone="warning"
              hint="отклонения в пределах 4× допуска"
            />
            <KpiTile
              label="Расхождения"
              value={fmtNum(kpi.err, 0)}
              icon={<XCircle className="h-4 w-4" />}
              tone="destructive"
              hint="требуется проверка вручную"
            />
            <KpiTile
              label="Сверка сумм"
              value={kpi.reconErr === 0 ? "✓" : `${kpi.reconErr}`}
              icon={<ShieldCheck className="h-4 w-4" />}
              tone={kpi.reconErr === 0 ? "success" : "warning"}
              hint={
                kpi.reconErr === 0
                  ? "TOTAL и типы совпадают"
                  : `${kpi.reconErr} расхождений в итогах`
              }
            />
          </section>

          {/* Что и откуда берём */}
          <SectionCard
            title="Откуда берутся данные"
            description="Каждая партия — это пара значений из листа Revenue (доход) и листа Expenses (расход) в исходном файле 3PL_weekly. Все маркеры пересчитываются здесь по формулам и сравниваются с исходником."
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <SourceCard
                title="Лист Revenue"
                color="var(--primary)"
                lines={[
                  "• Σ Доход партии (revenue)",
                  "• Дата отправки / № партии",
                  "• Колонка-идентификатор (F, G, H, …)",
                ]}
              />
              <SourceCard
                title="Лист Expenses"
                color="var(--destructive)"
                lines={[
                  "• Σ Расход партии (expense)",
                  "• Тариф Лайнхолла (M1)",
                  "• Веса: net / gross / vol",
                ]}
              />
              <SourceCard
                title="Производные (расчёт)"
                color="var(--success)"
                lines={[
                  "GP = Revenue − Expense",
                  "Margin% = GP / Revenue × 100",
                  "M1 = Expense / Total kg",
                  "M2 = Vol / Net   ·   M3 = Gross / Net",
                ]}
              />
            </div>
          </SectionCard>

          {/* Сверка сумм по типам и итогам */}
          <SectionCard
            title="Сверка итогов: лист ↔ сумма по партиям"
            description="Сравниваем TOTAL и разбивку по типам/зонтику UZUM CB из исходного листа со суммой, посчитанной по партиям. Допуск ±0.50 $."
          >
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Раздел</th>
                    <th className="px-3 py-2 font-semibold text-right">В листе</th>
                    <th className="px-3 py-2 font-semibold text-right">По партиям</th>
                    <th className="px-3 py-2 font-semibold text-right">Δ</th>
                    <th className="px-3 py-2 font-semibold">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2 font-semibold">{r.metric}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtUSD(r.source, 2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {fmtUSD(r.computed, 2)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-bold tabular-nums",
                          severityColor(r.severity)
                        )}
                      >
                        {r.severity === "ok"
                          ? "—"
                          : `${r.delta > 0 ? "+" : ""}${fmtUSD(r.delta, 2)}`}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider",
                            severityColor(r.severity)
                          )}
                        >
                          <SeverityIcon s={r.severity} />
                          {severityLabel(r.severity)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Таблица партий: revenue ↔ expense + маркеры */}
          <SectionCard
            title="Партии: сопоставление Revenue ↔ Expenses + проверка маркеров"
            description="Каждая строка — одна партия. Видно пару (доход + расход) и расчётные маркеры. Зелёная галочка — значение в листе совпадает с расчётом по формуле. Раскройте строку, чтобы увидеть формулы и Δ."
          >
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-8 text-center text-sm text-muted-foreground">
                Нет партий по выбранным фильтрам
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((a) => (
                  <PartyRow key={a.partyId} a={a} showWeek={isOverview} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Легенда */}
          <SectionCard title="Легенда и допуски" description="Как читать сверку">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <LegendRow
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                title="ok — совпадает"
                text="Расчётное значение отличается от значения в листе не больше, чем на допуск (округление)."
              />
              <LegendRow
                icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                title="внимание — небольшое отклонение"
                text="Отклонение в пределах 4× допуска. Скорее всего, разная база округления — стоит просто пересмотреть."
              />
              <LegendRow
                icon={<XCircle className="h-3.5 w-3.5 text-destructive" />}
                title="расхождение — реальная ошибка"
                text="Значение в листе явно отличается от формулы. Это требует проверки источника вручную."
              />
              <LegendRow
                icon={<Info className="h-3.5 w-3.5 text-muted-foreground" />}
                title="нет данных"
                text="В источнике нет одного из требуемых полей (например, total_kg или weight_net)."
              />
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
              <ToleranceRow label="Суммы (USD)" value="±0.50 $" />
              <ToleranceRow label="Тариф M1" value="±0.05 $/кг" />
              <ToleranceRow label="Коэффициенты M2/M3" value="±0.005x" />
              <ToleranceRow label="Маржа %" value="±0.50%" />
            </div>
          </SectionCard>
        </main>
      </div>
    </TooltipProvider>
  );
}

/* ============ Под-компоненты ============ */

function KpiTile({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "default" | "success" | "warning" | "destructive";
  hint?: string;
}) {
  const toneClasses: Record<string, string> = {
    default: "text-foreground bg-muted/40",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    destructive: "text-destructive bg-destructive/10",
  };
  return (
    <div className="rounded-2xl glass-card p-4 shadow-elegant">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center",
            toneClasses[tone]
          )}
        >
          {icon}
        </div>
      </div>
      <p
        className={cn(
          "mt-1.5 text-2xl font-bold tabular-nums leading-none",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive"
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function SourceCard({
  title,
  color,
  lines,
}: {
  title: string;
  color: string;
  lines: string[];
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 6%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)`,
            color,
          }}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
        </div>
        <p className="text-sm font-bold" style={{ color }}>
          {title}
        </p>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {lines.map((l, i) => (
          <li key={i} className="leading-relaxed">
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LegendRow({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3 flex items-start gap-2">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground mt-0.5 leading-snug">{text}</p>
      </div>
    </div>
  );
}

function ToleranceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

function PartyRow({ a, showWeek }: { a: PartyAudit; showWeek: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[a.type];
  const Icon = meta.icon;
  const checks = [a.gpCheck, a.marginCheck, a.m1Check, a.m2Check, a.m3Check];

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/40 transition-colors",
        a.status === "error"
          ? "border-destructive/40"
          : a.status === "warn"
            ? "border-warning/40"
            : "border-border/60"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 rounded-xl transition-colors"
      >
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            backgroundColor: `color-mix(in oklab, ${meta.color} 20%, transparent)`,
            color: meta.color,
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm tabular-nums">№{a.num}</span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
                color: meta.color,
              }}
            >
              {meta.label}
            </span>
            {showWeek && (
              <span className="text-[10px] font-semibold text-muted-foreground rounded border border-border/60 px-1.5 py-0.5">
                W{a.weekN}
              </span>
            )}
            {a.date && (
              <span className="text-[10px] text-muted-foreground">{a.date}</span>
            )}
            <span className="text-[10px] text-muted-foreground">· col {a.origCol}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Rev <span className="font-semibold text-primary tabular-nums">{fmtUSD(a.revenue, 2)}</span>
            </span>
            <ArrowRight className="h-3 w-3" />
            <span>
              Exp <span className="font-semibold text-destructive tabular-nums">{fmtUSD(a.expense, 2)}</span>
            </span>
            <Equal className="h-3 w-3" />
            <span>
              GP{" "}
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  a.revenue - a.expense >= 0 ? "text-success" : "text-destructive"
                )}
              >
                {fmtUSD(a.revenue - a.expense, 2)}
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-1">
            {checks.map((c, i) => (
              <UITooltip key={i}>
                <TooltipTrigger asChild>
                  <span>
                    <SeverityIcon s={c.severity} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {c.label}: {severityLabel(c.severity)}
                </TooltipContent>
              </UITooltip>
            ))}
          </div>
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md",
              a.status === "ok" && "bg-success/10 text-success",
              a.status === "warn" && "bg-warning/10 text-warning",
              a.status === "error" && "bg-destructive/10 text-destructive"
            )}
          >
            {severityLabel(a.status)}
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 py-3 bg-muted/15">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-2 py-1.5 font-semibold">Проверка</th>
                  <th className="px-2 py-1.5 font-semibold">Формула</th>
                  <th className="px-2 py-1.5 font-semibold text-right">В листе</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Расчёт</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Δ</th>
                  <th className="px-2 py-1.5 font-semibold">Статус</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="px-2 py-2 font-semibold inline-flex items-center gap-1.5">
                      <Calculator className="h-3 w-3 text-muted-foreground" />
                      {c.label}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground font-mono text-[11px]">
                      {c.formula}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {fmtVal(c.source, c.unit, c.decimals)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold">
                      {fmtVal(c.computed, c.unit, c.decimals)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2 text-right tabular-nums font-bold",
                        severityColor(c.severity)
                      )}
                    >
                      {c.delta == null
                        ? "—"
                        : c.severity === "ok"
                          ? "—"
                          : `${c.delta > 0 ? "+" : ""}${fmtVal(c.delta, c.unit, c.decimals)}`}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                          severityColor(c.severity)
                        )}
                      >
                        <SeverityIcon s={c.severity} />
                        {severityLabel(c.severity)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
