import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Party, PartyType, CountryCode } from "@/lib/types";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

type Unit = "pcs" | "kg";
type Scope =
  | { kind: "all" }
  | { kind: "type"; type: PartyType }
  | { kind: "party"; col: string };

type Row = {
  key: string;
  country: CountryCode;
  subtype: string;
  pcs: number;
  kg: number;
  color: string;
};

// Соответствие страна → подтип (как в исходном файле/скрине)
const COUNTRY_META: Record<CountryCode, { label: string; flag: string }> = {
  UZ: { label: "Узбекистан", flag: "🇺🇿" },
  BY: { label: "Беларусь", flag: "🇧🇾" },
  AZ: { label: "Азербайджан", flag: "🇦🇿" },
  KG: { label: "Киргизия", flag: "🇰🇬" },
};

// Подтип зависит от типа партии: CAINIAO даёт C2M-RM/NRM/SRMA/SRMA по странам;
// MPO/MKO — это сами по себе подтипы UZUM CB.
function rowsFromParties(parties: Party[]): Row[] {
  const map = new Map<string, Row>();
  // Палитра под страны/подтипы — близко к скрину пользователя
  const palette: Record<string, string> = {
    "UZ|RM": "hsl(220 90% 60%)",
    "BY|NRM": "hsl(35 90% 55%)",
    "AZ|SRMA": "hsl(265 80% 60%)",
    "KG|SRMA": "hsl(160 70% 45%)",
    "UZ|MPO": "hsl(190 85% 50%)",
    "UZ|MKO": "hsl(330 75% 55%)",
  };
  for (const p of parties) {
    if (!p.mix) continue;
    for (const [country, vals] of Object.entries(p.mix) as [CountryCode, { kg: number; pcs: number }][]) {
      let subtype = "RM";
      if (p.type === "CAINIAO") {
        if (country === "UZ") subtype = "RM";
        else if (country === "BY") subtype = "NRM";
        else subtype = "SRMA";
      } else if (p.type === "MPO") subtype = "MPO";
      else if (p.type === "MKO") subtype = "MKO";

      const key = `${country}|${subtype}`;
      const prev = map.get(key) ?? {
        key,
        country,
        subtype,
        pcs: 0,
        kg: 0,
        color: palette[key] ?? "hsl(210 15% 55%)",
      };
      prev.pcs += vals.pcs;
      prev.kg += vals.kg;
      map.set(key, prev);
    }
  }
  return [...map.values()].sort((a, b) => b.pcs - a.pcs);
}

function filterParties(all: Party[], scope: Scope): Party[] {
  if (scope.kind === "all") return all;
  if (scope.kind === "type") return all.filter((p) => p.type === scope.type);
  return all.filter((p) => p.col === scope.col);
}

export function ProductMix({ parties, scope }: { parties: Party[]; scope: Scope }) {
  const [unit, setUnit] = useState<Unit>("pcs");

  const filtered = useMemo(() => filterParties(parties, scope), [parties, scope]);
  const rows = useMemo(() => rowsFromParties(filtered), [filtered]);

  const totalPcs = rows.reduce((s, r) => s + r.pcs, 0);
  const totalKg = rows.reduce((s, r) => s + r.kg, 0);
  const total = unit === "pcs" ? totalPcs : totalKg;

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
    color: r.color,
  }));

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 space-y-4">
      {/* Переключатель */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Микс по странам / подтипам
        </p>
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

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(160px,200px)_1fr] gap-4 items-center">
        {/* Donut */}
        <div className="relative h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={2}
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
            <p className="text-lg font-bold tabular-nums">
              {unit === "pcs" ? fmtNum(total, 0) : fmtNum(total, 1)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {unit === "pcs" ? "штук" : "кг"}
            </p>
          </div>
        </div>

        {/* Таблица */}
        <div className="space-y-1.5">
          {rows.map((r) => {
            const v = unit === "pcs" ? r.pcs : r.kg;
            const share = total > 0 ? v / total : 0;
            return (
              <div key={r.key} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: r.color }}
                />
                <span className="text-base leading-none">{COUNTRY_META[r.country].flag}</span>
                <span className="font-semibold w-7">{r.country}</span>
                <span className="text-muted-foreground w-12">{r.subtype}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${share * 100}%`, backgroundColor: r.color }}
                  />
                </div>
                <span className="tabular-nums font-bold w-20 text-right">
                  {unit === "pcs" ? fmtNum(v, 0) : `${fmtNum(v, 1)} кг`}
                </span>
                <span className="tabular-nums text-muted-foreground w-12 text-right">
                  {(share * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Итоги обоих юнитов */}
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
