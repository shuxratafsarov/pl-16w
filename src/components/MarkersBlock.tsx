import { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { Gauge, TrendingUp, Layers, Percent } from "lucide-react";
import type { Party, PartyType } from "@/lib/types";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

type MarkerKey = "marker1_tariff" | "marker2_volnet" | "marker3_grossnet" | "marker4_margin";

type MarkerDef = {
  key: MarkerKey;
  short: string;
  title: string;
  unit: string;
  decimals: number;
  /** "above" — выше = хуже (тариф, vol/net, gross/net). "below" — ниже = хуже (маржа). */
  direction: "above" | "below";
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

const MARKERS: MarkerDef[] = [
  { key: "marker1_tariff", short: "M1 · Тариф", title: "Тариф линейхолла", unit: " $/кг", decimals: 2, direction: "above", icon: Gauge, color: "var(--chart-1)" },
  { key: "marker2_volnet", short: "M2 · Vol/Net", title: "Объёмный / Нетто", unit: "x", decimals: 3, direction: "above", icon: Layers, color: "var(--chart-2)" },
  { key: "marker3_grossnet", short: "M3 · Gross/Net", title: "Брутто / Нетто", unit: "x", decimals: 3, direction: "above", icon: Layers, color: "var(--chart-4)" },
  { key: "marker4_margin", short: "M4 · Маржа", title: "Маржа партии", unit: "%", decimals: 2, direction: "below", icon: Percent, color: "var(--chart-5)" },
];

/** Достаём значение маркера из партии (M4 берём из margin_pct). */
function getMarkerValue(p: Party, m: MarkerKey): number | null {
  if (m === "marker4_margin") return p.margin_pct;
  const v = p[m];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const WARN_PCT = 0.1;
const CRIT_PCT = 0.2;
type Status = "ok" | "warning" | "critical";

function statusFromAvg(value: number, avg: number, dir: "above" | "below"): Status {
  if (avg <= 0 && dir === "above") return "ok";
  const ratio = value / avg;
  if (dir === "above") {
    if (ratio >= 1 + CRIT_PCT) return "critical";
    if (ratio >= 1 + WARN_PCT) return "warning";
    return "ok";
  }
  // below — ниже = хуже (маржа)
  if (ratio <= 1 - CRIT_PCT) return "critical";
  if (ratio <= 1 - WARN_PCT) return "warning";
  return "ok";
}

function statusColor(s: Status): string {
  return s === "critical" ? "var(--destructive)" : s === "warning" ? "var(--warning)" : "var(--success)";
}

/* === Высокоуровневый блок: 4 мини-графика, режим "all" / по типу / по партии === */
export function MarkersBlock({
  parties,
  scope,
  highlightCol,
}: {
  parties: Party[]; // все партии для расчёта средних по типам
  /** Что показываем:
   *  - "all": все 3 типа на одном баре (среднее по типу)
   *  - { type } : партии конкретного типа
   *  - { col } : одна партия (radial gauge со сравнением со средним по её типу)
   */
  scope: { kind: "all" } | { kind: "type"; type: PartyType } | { kind: "party"; col: string };
  highlightCol?: string;
}) {
  if (scope.kind === "party") {
    return <PartyMarkersGauges parties={parties} col={scope.col} />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {MARKERS.map((m) => (
        <MarkerMiniChart
          key={m.key}
          marker={m}
          parties={parties}
          scope={scope}
          highlightCol={highlightCol}
        />
      ))}
    </div>
  );
}

/* === Мини-график одного маркера === */
function MarkerMiniChart({
  marker,
  parties,
  scope,
  highlightCol,
}: {
  marker: MarkerDef;
  parties: Party[];
  scope: { kind: "all" } | { kind: "type"; type: PartyType };
  highlightCol?: string;
}) {
  const Icon = marker.icon;

  const data = useMemo(() => {
    if (scope.kind === "all") {
      // среднее по типу
      return (["CAINIAO", "MPO", "MKO"] as PartyType[]).map((t) => {
        const vals = parties
          .filter((p) => p.type === t)
          .map((p) => getMarkerValue(p, marker.key))
          .filter((v): v is number => v != null);
        const avg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        return {
          name: t,
          value: avg,
          fill: `var(--${t.toLowerCase()})`,
          count: vals.length,
        };
      }).filter((d) => d.value != null);
    }
    // по партиям одного типа
    const list = parties
      .filter((p) => p.type === scope.type)
      .map((p) => ({
        name: `№${p.num}`,
        col: p.col,
        value: getMarkerValue(p, marker.key),
        fill: `var(--${p.type.toLowerCase()})`,
      }))
      .filter((d) => d.value != null);
    return list;
  }, [marker.key, parties, scope]);

  // среднее и пороги — считаем от выборки на графике
  const stats = useMemo(() => {
    const vals = data.map((d) => d.value as number);
    if (vals.length === 0) return null;
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const warn = marker.direction === "above" ? avg * (1 + WARN_PCT) : avg * (1 - WARN_PCT);
    const crit = marker.direction === "above" ? avg * (1 + CRIT_PCT) : avg * (1 - CRIT_PCT);
    return { avg, min, max, warn, crit };
  }, [data, marker.direction]);

  // раскраска баров
  const colored = useMemo(() => {
    if (!stats) return data;
    return data.map((d) => {
      const v = d.value as number;
      const s = statusFromAvg(v, stats.avg, marker.direction);
      const isHighlight = "col" in d && d.col === highlightCol;
      return {
        ...d,
        // если статус ok — цвет сегмента (тип), иначе — статусный цвет
        barFill: s === "ok" ? d.fill : statusColor(s),
        outline: isHighlight ? "var(--ring)" : undefined,
      };
    });
  }, [data, stats, marker.direction, highlightCol]);

  const hasData = stats != null;

  return (
    <div className="rounded-xl border border-border bg-card/40 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `color-mix(in oklab, ${marker.color} 22%, transparent)`, color: marker.color }}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">{marker.short}</p>
            <p className="text-[10px] text-muted-foreground truncate">{marker.title}</p>
          </div>
        </div>
        {hasData && (
          <div className="text-right shrink-0">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">средн.</p>
            <p className="text-xs font-bold tabular-nums">{fmtNum(stats.avg, marker.decimals)}{marker.unit}</p>
          </div>
        )}
      </div>

      {hasData ? (
        <>
          <div className="h-32">
            <ResponsiveContainer>
              <BarChart data={colored} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={9} tickLine={false} axisLine={false} interval={0} />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 11,
                    padding: "6px 10px",
                  }}
                  formatter={(v: number) => [`${fmtNum(v, marker.decimals)}${marker.unit}`, marker.short]}
                />
                <ReferenceLine y={stats.avg} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeOpacity={0.6} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {colored.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.barFill as string}
                      stroke={d.outline as string | undefined}
                      strokeWidth={d.outline ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* min/max строка */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>min <span className="font-semibold text-foreground">{fmtNum(stats.min, marker.decimals)}{marker.unit}</span></span>
            <span className="text-muted-foreground">
              {marker.direction === "above" ? "↑ выше = хуже" : "↓ ниже = хуже"}
            </span>
            <span>max <span className="font-semibold text-foreground">{fmtNum(stats.max, marker.decimals)}{marker.unit}</span></span>
          </div>
        </>
      ) : (
        <div className="h-32 flex items-center justify-center text-[11px] text-muted-foreground">
          Нет данных
        </div>
      )}
    </div>
  );
}

/* === Партия: 4 «спидометра» с отклонением от среднего по типу === */
function PartyMarkersGauges({ parties, col }: { parties: Party[]; col: string }) {
  const party = parties.find((p) => p.col === col);
  if (!party) return null;

  const sameType = parties.filter((p) => p.type === party.type);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {MARKERS.map((m) => {
        const v = getMarkerValue(party, m.key);
        const vals = sameType.map((p) => getMarkerValue(p, m.key)).filter((x): x is number => x != null);
        const avg = vals.length > 0 ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
        const min = vals.length > 0 ? Math.min(...vals) : null;
        const max = vals.length > 0 ? Math.max(...vals) : null;
        const status: Status | null = v != null && avg != null && avg !== 0 ? statusFromAvg(v, avg, m.direction) : null;
        const dev = v != null && avg != null && avg !== 0 ? ((v - avg) / avg) * 100 : null;

        // позиция партии в диапазоне min..max
        const positionPct =
          v != null && min != null && max != null && max > min
            ? ((v - min) / (max - min)) * 100
            : 50;

        return (
          <div key={m.key} className="rounded-xl border border-border bg-card/40 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `color-mix(in oklab, ${m.color} 22%, transparent)`, color: m.color }}
                >
                  <m.icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{m.short}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{m.title}</p>
                </div>
              </div>
              {status && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${statusColor(status)} 18%, transparent)`,
                    color: statusColor(status),
                  }}
                >
                  {status === "ok" ? "норма" : status === "warning" ? "внимание" : "критич."}
                </span>
              )}
            </div>

            {v != null ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-2xl font-bold tabular-nums leading-none">
                    {fmtNum(v, m.decimals)}<span className="text-sm text-muted-foreground">{m.unit}</span>
                  </p>
                  {dev != null && (
                    <span
                      className={cn(
                        "text-xs font-bold tabular-nums",
                        Math.abs(dev) < 1 ? "text-muted-foreground" :
                        (m.direction === "above" ? dev > 0 : dev < 0) ? "text-destructive" : "text-success"
                      )}
                    >
                      {dev >= 0 ? "+" : ""}{dev.toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* шкала min — avg — max c маркером партии */}
                {min != null && max != null && avg != null && max > min && (
                  <>
                    <div className="relative h-2 rounded-full bg-muted overflow-visible mt-3">
                      {/* avg маркер */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-muted-foreground/70"
                        style={{ left: `${((avg - min) / (max - min)) * 100}%` }}
                      />
                      {/* fill от 0 до позиции партии */}
                      <div
                        className="absolute top-0 left-0 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(0, Math.min(100, positionPct))}%`,
                          backgroundColor: status ? statusColor(status) : m.color,
                        }}
                      />
                      {/* точка партии */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-background shadow-md"
                        style={{
                          left: `${Math.max(0, Math.min(100, positionPct))}%`,
                          backgroundColor: status ? statusColor(status) : m.color,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                      <span>{fmtNum(min, m.decimals)}</span>
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp className="h-2.5 w-2.5" /> avg {fmtNum(avg, m.decimals)}
                      </span>
                      <span>{fmtNum(max, m.decimals)}</span>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="h-16 flex items-center justify-center text-[11px] text-muted-foreground">
                Нет данных
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
