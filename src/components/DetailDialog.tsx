import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Wallet,
  Receipt,
  TrendingUp,
  Percent,
  Plane,
  PackageCheck,
  Banknote,
  Calendar,
  Scale,
  Box,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import { fmtUSD, fmtNum, fmtPct } from "@/lib/format";
import type { Party, PartyType, WeekData } from "@/lib/types";
import { cn } from "@/lib/utils";

export type DetailTarget =
  | { kind: "kpi"; metric: "revenue" | "expense" | "gross_profit" | "margin" }
  | { kind: "type"; type: PartyType }
  | { kind: "party"; col: string };

const TYPE_META: Record<PartyType, { label: string; full: string; color: string; icon: LucideIcon }> = {
  CAINIAO: { label: "CAINIAO", full: "Cainiao C2M · авиа Китай→UZ", color: "var(--cainiao)", icon: Plane },
  MPO: { label: "UZUM MPO", full: "UZUM Crossborder · MPO", color: "var(--mpo)", icon: PackageCheck },
  MKO: { label: "UZUM MKO", full: "UZUM Crossborder · MKO", color: "var(--mko)", icon: Banknote },
};

const KPI_META = {
  revenue: { label: "Выручка", icon: Wallet, accent: "var(--primary)", gradient: "gradient-primary", desc: "Сколько денег принесла каждая категория" },
  expense: { label: "Расходы", icon: Receipt, accent: "var(--destructive)", gradient: "gradient-danger", desc: "Куда уходят деньги: 1-я миля, линейхолл, FOT, последняя миля" },
  gross_profit: { label: "Валовая прибыль", icon: TrendingUp, accent: "var(--success)", gradient: "gradient-success", desc: "Что остаётся после операционных расходов" },
  margin: { label: "Маржа", icon: Percent, accent: "var(--warning)", gradient: "gradient-warn", desc: "Прибыль на каждый доллар выручки" },
} as const;

export function DetailDialog({
  target,
  week,
  onOpenChange,
  onSelectParty,
}: {
  target: DetailTarget | null;
  week: WeekData;
  onOpenChange: (open: boolean) => void;
  onSelectParty?: (col: string) => void;
}) {
  const open = target !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto glass-card border-border">
        {target?.kind === "kpi" && <KpiDetails metric={target.metric} week={week} onSelectParty={onSelectParty} />}
        {target?.kind === "type" && <TypeDetails type={target.type} week={week} onSelectParty={onSelectParty} />}
        {target?.kind === "party" && <PartyDetails col={target.col} week={week} />}
      </DialogContent>
    </Dialog>
  );
}

/* === KPI: разбивка метрики по типам === */
function KpiDetails({
  metric,
  week,
  onSelectParty,
}: {
  metric: "revenue" | "expense" | "gross_profit" | "margin";
  week: WeekData;
  onSelectParty?: (col: string) => void;
}) {
  const meta = KPI_META[metric];
  const Icon = meta.icon;

  const totalValue = useMemo(() => {
    if (metric === "margin") return week.totals.margin_pct;
    return week.totals[metric];
  }, [metric, week]);

  const breakdown = useMemo(() => {
    return (Object.keys(TYPE_META) as PartyType[])
      .filter((t) => week.byType[t] != null)
      .map((t) => {
        const agg = week.byType[t];
        const value = metric === "margin" ? agg.margin_pct : (agg[metric] as number);
        const total = metric === "margin" ? null : (week.totals[metric] as number);
        const share = total && total !== 0 ? value / total : null;
        return { type: t, value, share, agg };
      });
  }, [metric, week]);

  const topParties = useMemo(() => {
    if (metric === "margin") {
      // лучшие и худшие по марже
      const withMargin = week.parties.filter((p) => p.margin_pct != null);
      const sorted = [...withMargin].sort((a, b) => (b.margin_pct as number) - (a.margin_pct as number));
      return { best: sorted.slice(0, 3), worst: sorted.slice(-3).reverse() };
    }
    const sorted = [...week.parties].sort((a, b) => {
      const av = a[metric === "gross_profit" ? "gross_profit" : metric] as number;
      const bv = b[metric === "gross_profit" ? "gross_profit" : metric] as number;
      return bv - av;
    });
    return { top: sorted.slice(0, 5) };
  }, [metric, week]);

  const fmt = (v: number) => (metric === "margin" ? `${v.toFixed(2)}%` : fmtUSD(v));

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-glow", meta.gradient)}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle className="text-xl">{meta.label}</DialogTitle>
            <DialogDescription>{meta.desc}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="mt-2 space-y-5">
        {/* Итог */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Итого за неделю</p>
          <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color: meta.accent }}>
            {fmt(totalValue)}
          </p>
          {metric === "expense" && (
            <p className="text-xs text-muted-foreground mt-1">
              {fmtPct(week.totals.expense / week.totals.revenue)} от выручки
            </p>
          )}
          {metric === "margin" && (
            <p className="text-xs text-muted-foreground mt-1">
              {fmtUSD(week.totals.gross_profit)} GP / {fmtUSD(week.totals.revenue)} Revenue
            </p>
          )}
        </div>

        {/* Разбивка по типам */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Разбивка по типам бизнеса
          </p>
          <div className="space-y-3">
            {breakdown.map(({ type, value, share, agg }) => {
              const tMeta = TYPE_META[type];
              const TIcon = tMeta.icon;
              return (
                <div key={type} className="rounded-xl border border-border bg-card/40 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: tMeta.color }}
                      >
                        <TIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold" style={{ color: tMeta.color }}>{tMeta.label}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{agg.count} партий</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold tabular-nums">{fmt(value)}</p>
                      {share != null && (
                        <p className="text-[11px] text-muted-foreground tabular-nums">{fmtPct(share, 1)} от итога</p>
                      )}
                    </div>
                  </div>
                  {share != null && (
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, share * 100))}%`, backgroundColor: tMeta.color }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Топ партии */}
        {metric !== "margin" && "top" in topParties && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Топ-5 партий по «{meta.label.toLowerCase()}»
            </p>
            <div className="space-y-1.5">
              {topParties.top.map((p, i) => (
                <PartyRow key={p.col} party={p} rank={i + 1} value={fmt(p[metric === "gross_profit" ? "gross_profit" : metric] as number)} onClick={onSelectParty} />
              ))}
            </div>
          </div>
        )}
        {metric === "margin" && "best" in topParties && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-success mb-3">Лучшие по марже</p>
              <div className="space-y-1.5">
                {topParties.best.map((p, i) => (
                  <PartyRow key={p.col} party={p} rank={i + 1} value={`${(p.margin_pct as number).toFixed(2)}%`} onClick={onSelectParty} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive mb-3">Худшие по марже</p>
              <div className="space-y-1.5">
                {topParties.worst.map((p, i) => (
                  <PartyRow key={p.col} party={p} rank={i + 1} value={`${(p.margin_pct as number).toFixed(2)}%`} onClick={onSelectParty} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* === Тип: все партии этого типа === */
function TypeDetails({
  type,
  week,
  onSelectParty,
}: {
  type: PartyType;
  week: WeekData;
  onSelectParty?: (col: string) => void;
}) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  const agg = week.byType[type];
  const parties = useMemo(
    () => week.parties.filter((p) => p.type === type).sort((a, b) => b.revenue - a.revenue),
    [type, week]
  );

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-glow"
            style={{ backgroundColor: meta.color }}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle className="text-xl" style={{ color: meta.color }}>{meta.label}</DialogTitle>
            <DialogDescription>{meta.full}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="mt-2 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MiniBox label="Выручка" value={fmtUSD(agg.revenue)} />
          <MiniBox label="Расходы" value={fmtUSD(agg.expense)} />
          <MiniBox
            label="Прибыль"
            value={fmtUSD(agg.gross_profit)}
            valueClass={agg.gross_profit >= 0 ? "text-success" : "text-destructive"}
          />
          <MiniBox
            label="Маржа"
            value={`${agg.margin_pct.toFixed(2)}%`}
            valueClass={agg.margin_pct >= 15 ? "text-success" : agg.margin_pct >= 5 ? "text-warning" : "text-destructive"}
          />
        </div>

        {agg.note && (
          <div className="rounded-lg bg-accent/30 border border-accent/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
            ⓘ {agg.note}
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Партии направления ({parties.length})
          </p>
          <div className="space-y-1.5">
            {parties.map((p, i) => (
              <PartyRow key={p.col} party={p} rank={i + 1} value={fmtUSD(p.revenue)} onClick={onSelectParty} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* === Партия: полная карточка === */
function PartyDetails({ col, week }: { col: string; week: WeekData }) {
  const party = week.parties.find((p) => p.col === col);
  if (!party) return null;
  const tMeta = TYPE_META[party.type];
  const TIcon = tMeta.icon;
  const isProfit = party.gross_profit >= 0;

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-glow"
            style={{ backgroundColor: tMeta.color }}
          >
            <TIcon className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle className="text-xl">Партия №{party.num}</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <span style={{ color: tMeta.color }} className="font-semibold">{tMeta.label}</span>
              {party.date && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{party.date}</span>
                </>
              )}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="mt-2 space-y-5">
        {/* Финансы */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Финансы</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniBox label="Выручка" value={fmtUSD(party.revenue)} />
            <MiniBox label="Расходы" value={fmtUSD(party.expense)} />
            <MiniBox
              label="GP"
              value={fmtUSD(party.gross_profit)}
              valueClass={isProfit ? "text-success" : "text-destructive"}
            />
            <MiniBox
              label="Маржа"
              value={party.margin_pct != null ? `${party.margin_pct.toFixed(2)}%` : "—"}
              valueClass={
                party.margin_pct == null
                  ? ""
                  : party.margin_pct >= 15
                  ? "text-success"
                  : party.margin_pct >= 5
                  ? "text-warning"
                  : "text-destructive"
              }
            />
          </div>
        </div>

        {/* Веса */}
        {(party.weight_net != null || party.weight_gross != null || party.weight_vol != null) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 inline-flex items-center gap-1.5">
              <Scale className="h-3 w-3" /> Вес
            </p>
            <div className="grid grid-cols-3 gap-2">
              <MiniBox label="Нетто" value={party.weight_net != null ? `${fmtNum(party.weight_net, 1)} кг` : "—"} />
              <MiniBox label="Брутто" value={party.weight_gross != null ? `${fmtNum(party.weight_gross, 1)} кг` : "—"} />
              <MiniBox label="Объёмный" value={party.weight_vol != null ? `${fmtNum(party.weight_vol, 1)} кг` : "—"} />
            </div>
          </div>
        )}

        {/* Маркеры */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 inline-flex items-center gap-1.5">
            <Gauge className="h-3 w-3" /> Маркеры
          </p>
          <div className="grid grid-cols-3 gap-2">
            <MiniBox
              label="M1 · Тариф"
              value={party.marker1_tariff != null ? `${fmtNum(party.marker1_tariff, 2)} $/кг` : "—"}
            />
            <MiniBox
              label="M2 · Vol/Net"
              value={party.marker2_volnet != null ? `${fmtNum(party.marker2_volnet, 3)}x` : "—"}
            />
            <MiniBox
              label="M3 · Gross/Net"
              value={party.marker3_grossnet != null ? `${fmtNum(party.marker3_grossnet, 3)}x` : "—"}
            />
          </div>
        </div>

        {party.total_kg != null && (
          <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-2">
            <Box className="h-3.5 w-3.5" />
            Тарифицируемый вес: <span className="font-semibold text-foreground tabular-nums">{fmtNum(party.total_kg, 1)} кг</span>
          </div>
        )}
      </div>
    </>
  );
}

/* === Helpers === */
function MiniBox({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={cn("text-sm font-bold tabular-nums mt-0.5", valueClass)}>{value}</p>
    </div>
  );
}

function PartyRow({
  party,
  rank,
  value,
  onClick,
}: {
  party: Party;
  rank: number;
  value: string;
  onClick?: (col: string) => void;
}) {
  const tMeta = TYPE_META[party.type];
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={clickable ? () => onClick!(party.col) : undefined}
      disabled={!clickable}
      className={cn(
        "w-full flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-left transition-colors",
        clickable && "hover:bg-muted/60 hover:border-border cursor-pointer"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-[11px] font-bold text-muted-foreground tabular-nums w-5 shrink-0">#{rank}</span>
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold shrink-0"
          style={{ backgroundColor: `color-mix(in oklab, ${tMeta.color} 18%, transparent)`, color: tMeta.color }}
        >
          {tMeta.label}
        </span>
        <span className="text-sm font-semibold tabular-nums truncate">№{party.num}</span>
        {party.date && <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">· {party.date}</span>}
      </div>
      <span className="text-sm font-bold tabular-nums shrink-0">{value}</span>
    </button>
  );
}
