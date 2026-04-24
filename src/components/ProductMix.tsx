import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Party, PartyType, MixRow } from "@/lib/types";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

type Unit = "pcs" | "kg";
type Scope =
  | { kind: "all" }
  | { kind: "type"; type: PartyType }
  | { kind: "party"; col: string };

const COUNTRY_META: Record<string, { label: string; flag: string; color: string }> = {
  UZ: { label: "Узбекистан", flag: "🇺🇿", color: "hsl(220 90% 60%)" },
  BY: { label: "Беларусь", flag: "🇧🇾", color: "hsl(35 90% 55%)" },
  AZ: { label: "Азербайджан", flag: "🇦🇿", color: "hsl(265 80% 60%)" },
  KG: { label: "Киргизия", flag: "🇰🇬", color: "hsl(160 70% 45%)" },
  KZ: { label: "Казахстан", flag: "🇰🇿", color: "hsl(0 70% 55%)" },
};

// Палитра подтипов внутри каждой страны (оттенки от базового цвета)
const SUBTYPE_HUES: Record<string, number> = {
  RM: 0,
  SRM: 12,
  SRMA: 24,
  SRMB: 36,
  SRMC: 48,
  SRMDG: 60,
  NRM: 0,
  RRM: 14,
  NRMDG: 28,
  CX: 0,
  RX: 16,
  MPO: 0,
  MKO: 0,
};

function colorFor(country: string, subtype: string, idx: number): string {
  const baseColor = COUNTRY_META[country]?.color;
  if (!baseColor) {
    // fallback — серый с разным lightness
    const l = 40 + (idx % 5) * 8;
    return `hsl(210 15% ${l}%)`;
  }
  // base format: hsl(H S% L%)
  const m = baseColor.match(/hsl\(([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)/);
  if (!m) return baseColor;
  const h = parseFloat(m[1]);
  const s = parseFloat(m[2]);
  const l = parseFloat(m[3]);
  const offset = SUBTYPE_HUES[subtype] ?? idx * 8;
  const lAdj = Math.max(30, Math.min(72, l + (idx % 3 - 1) * 8));
  return `hsl(${(h + offset) % 360} ${s}% ${lAdj}%)`;
}

function aggregate(parties: Party[]): MixRow[] {
  const map = new Map<string, MixRow>();
  for (const p of parties) {
    if (!p.mix) continue;
    for (const r of p.mix) {
      const key = `${r.country}|${r.subtype}`;
      const prev = map.get(key) ?? { country: r.country, subtype: r.subtype, pcs: 0, kg: 0 };
      prev.pcs += r.pcs;
      prev.kg += r.kg;
      map.set(key, prev);
    }
  }
  // Sort by country (UZ, BY, AZ, KG, KZ), then by pcs desc
  const order = ["UZ", "BY", "AZ", "KG", "KZ"];
  return [...map.values()].sort((a, b) => {
    const oa = order.indexOf(a.country as string);
    const ob = order.indexOf(b.country as string);
    if (oa !== ob) return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
    return b.pcs - a.pcs;
  });
}

function filterParties(all: Party[], scope: Scope): Party[] {
  if (scope.kind === "all") return all;
  if (scope.kind === "type") return all.filter((p) => p.type === scope.type);
  return all.filter((p) => p.col === scope.col);
}

export function ProductMix({ parties, scope }: { parties: Party[]; scope: Scope }) {
  const [unit, setUnit] = useState<Unit>("pcs");

  const filtered = useMemo(() => filterParties(parties, scope), [parties, scope]);
  const rows = useMemo(() => aggregate(filtered), [filtered]);

  const totalPcs = rows.reduce((s, r) => s + r.pcs, 0);
  const totalKg = rows.reduce((s, r) => s + r.kg, 0);
  const total = unit === "pcs" ? totalPcs : totalKg;

  // Группировка по стране
  const byCountry = useMemo(() => {
    const groups = new Map<string, MixRow[]>();
    rows.forEach((r) => {
      const arr = groups.get(r.country as string) ?? [];
      arr.push(r);
      groups.set(r.country as string, arr);
    });
    return groups;
  }, [rows]);

  // Цвета (стабильные индексы)
  const colors = useMemo(() => {
    const m = new Map<string, string>();
    let i = 0;
    rows.forEach((r) => {
      m.set(`${r.country}|${r.subtype}`, colorFor(r.country as string, r.subtype, i++));
    });
    return m;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Нет данных по структуре товаров
      </div>
    );
  }

  const data = rows.map((r) => ({
    name: `${r.country} ${r.subtype}`,
    value: unit === "pcs" ? r.pcs : r.kg,
    color: colors.get(`${r.country}|${r.subtype}`)!,
  }));

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 space-y-4">
      {/* Заголовок + переключатель */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            M4 · Продуктовый микс ({unit === "pcs" ? "штуки" : "кг"})
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Из листа Expenses · {rows.length} категорий
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setUnit("pcs")}
            className={cn(
              "px-3 py-1 rounded-md transition-colors font-semibold",
              unit === "pcs" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            шт
          </button>
          <button
            type="button"
            onClick={() => setUnit("kg")}
            className={cn(
              "px-3 py-1 rounded-md transition-colors font-semibold",
              unit === "kg" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            кг
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_140px_1fr] gap-4 items-start">
        {/* Donut */}
        <div className="relative h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="92%"
                paddingAngle={1.5}
                stroke="none"
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, n: string) => [
                  unit === "pcs" ? `${fmtNum(v, 0)} шт` : `${fmtNum(v, 1)} кг`,
                  n,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-2xl font-bold tabular-nums">
              {unit === "pcs" ? fmtNum(total, 0) : fmtNum(total, 1)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {unit === "pcs" ? "штук" : "кг"}
            </p>
          </div>
        </div>

        {/* Легенда */}
        <div className="space-y-1 text-[11px] max-h-56 overflow-y-auto pr-1">
          {rows.map((r) => (
            <div key={`${r.country}|${r.subtype}`} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: colors.get(`${r.country}|${r.subtype}`)! }}
              />
              <span className="font-mono text-muted-foreground">{r.country}</span>
              <span className="font-mono text-foreground">{r.subtype}</span>
            </div>
          ))}
        </div>

        {/* Таблица как на скрине */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2 font-semibold">Страна</th>
                <th className="px-2 py-2 font-semibold">Тип</th>
                <th className="px-2 py-2 font-semibold text-right">{unit === "pcs" ? "Штук" : "Кг"}</th>
                <th className="px-2 py-2 font-semibold text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {[...byCountry.entries()].map(([country, items]) => {
                const countrySum = items.reduce((s, r) => s + (unit === "pcs" ? r.pcs : r.kg), 0);
                return items.map((r, idx) => {
                  const v = unit === "pcs" ? r.pcs : r.kg;
                  const sharePct = countrySum > 0 ? (v / countrySum) * 100 : 0;
                  const meta = COUNTRY_META[country];
                  return (
                    <tr
                      key={`${country}|${r.subtype}`}
                      className={cn(
                        "border-b border-border/40 hover:bg-muted/30 transition-colors",
                        idx === 0 && "border-t border-border/60"
                      )}
                    >
                      <td className="px-2 py-2 font-bold">
                        {idx === 0 ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-base leading-none">{meta?.flag ?? "🏳"}</span>
                            <span>{country}</span>
                          </span>
                        ) : (
                          <span className="opacity-0">{country}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground font-mono">{r.subtype}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-bold">
                        {unit === "pcs" ? fmtNum(v, 0) : fmtNum(v, 1)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right tabular-nums font-semibold",
                          sharePct >= 50 ? "text-destructive" : sharePct >= 25 ? "text-warning" : "text-muted-foreground"
                        )}
                      >
                        {sharePct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                });
              })}
              <tr className="border-t-2 border-border bg-muted/40">
                <td colSpan={2} className="px-2 py-2.5 font-bold text-foreground">
                  Итого {unit === "pcs" ? "посылок" : "вес"}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums font-bold text-base">
                  {unit === "pcs" ? `${fmtNum(totalPcs, 0)}` : `${fmtNum(totalKg, 1)} кг`}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums font-bold text-muted-foreground">
                  100%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Двойной итог */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
        <div className="rounded-lg bg-muted/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Всего штук</p>
          <p className="text-sm font-bold tabular-nums mt-0.5">{fmtNum(totalPcs, 0)} шт</p>
        </div>
        <div className="rounded-lg bg-muted/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Всего вес</p>
          <p className="text-sm font-bold tabular-nums mt-0.5">{fmtNum(totalKg, 1)} кг</p>
        </div>
      </div>
    </div>
  );
}
