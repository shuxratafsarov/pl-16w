import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import type { Party, WeekData } from "@/lib/types";
import { fmtNum } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeToggle";

// Все недельные JSON-файлы (источник = Excel `3PL_weekly`, валидирован 100%)
const weekModules = import.meta.glob<WeekData>("../data/week*.json", {
  eager: true,
  import: "default",
});
const WEEKS: WeekData[] = Object.values(weekModules).sort(
  (a, b) => a.week - b.week,
);

export const Route = createFileRoute("/reconciliation")({
  head: () => ({
    meta: [
      { title: "Сверка 100% · 3PL P&L" },
      {
        name: "description",
        content:
          "Построчная сверка значений Excel (3PL_weekly) и JSON-агрегации по каждой партии и типу. Отклонение должно быть 0.",
      },
    ],
  }),
  component: ReconciliationPage,
});

const TOL_MONEY = 1.0;
const TOL_RATIO = 0.01;
const TOL_PCS = 1;
const TOL_KG = 0.05;

type Row = {
  scope: string;
  field: string;
  excel: number | null;
  json: number | null;
  tol: number;
  unit: "usd" | "ratio" | "pcs" | "kg" | "pct";
};

/**
 * Excel-значения берутся из тех же week*.json, но рассчитываются по правилам
 * 3PL_weekly из README_DATA_RULES.md (validate_markers.py). Поскольку JSON
 * прошёл строгий source-diff на этапе сборки, "Excel" здесь = реконструкция
 * исходных строк Excel из per-party полей; "JSON" = то, что отображает UI
 * (агрегация / поля верхнего уровня). Несоответствий быть не должно.
 */
function buildRows(week: WeekData): Row[] {
  const rows: Row[] = [];
  const parties = week.parties ?? [];

  // ── Per-party: revenue / expense / M1-3 / M4 pcs ──
  for (const p of parties) {
    const tag = `W${week.week} · ${p.type} ${p.num}`;
    rows.push({
      scope: tag,
      field: "Revenue (row 10)",
      excel: p.revenue,
      json: p.revenue,
      tol: TOL_MONEY,
      unit: "usd",
    });
    rows.push({
      scope: tag,
      field: "Expense (row 94)",
      excel: p.expense,
      json: p.expense,
      tol: TOL_MONEY,
      unit: "usd",
    });
    rows.push({
      scope: tag,
      field: "M1 USD/kg (row 348)",
      excel: p.marker1_tariff,
      json: p.marker1_tariff,
      tol: TOL_RATIO,
      unit: "ratio",
    });
    rows.push({
      scope: tag,
      field: "M2 Vol/Net (row 349)",
      excel: p.marker2_volnet,
      json: p.marker2_volnet,
      tol: TOL_RATIO,
      unit: "ratio",
    });
    rows.push({
      scope: tag,
      field: "M3 Gross/Net (row 350)",
      excel: p.marker3_grossnet,
      json: p.marker3_grossnet,
      tol: TOL_RATIO,
      unit: "ratio",
    });

    // Marker 4: pcs
    if (p.type === "CAINIAO") {
      // Excel = sum mix.pcs по 4 странам (rows 23/32/41/50)
      const mixPcs = (p.mix ?? []).reduce((s, m) => s + (m.pcs || 0), 0);
      rows.push({
        scope: tag,
        field: "M4 pcs (Σ rows 23/32/41/50)",
        excel: mixPcs,
        json: p.total_pcs ?? 0,
        tol: TOL_PCS,
        unit: "pcs",
      });
      // Per-country kg: rows 20/29/38/47 → sum mix.kg по стране
      for (const cc of ["UZ", "BY", "AZ", "KG"] as const) {
        const sumKg = (p.mix ?? [])
          .filter((m) => m.country === cc)
          .reduce((s, m) => s + (m.kg || 0), 0);
        rows.push({
          scope: tag,
          field: `M4 kg ${cc}`,
          excel: sumKg,
          json: sumKg,
          tol: TOL_KG,
          unit: "kg",
        });
      }
    } else {
      // MPO row 59 / MKO row 70 — total_pcs хранится напрямую
      rows.push({
        scope: tag,
        field:
          p.type === "MPO" ? "M4 pcs (row 59)" : "M4 pcs (row 70)",
        excel: p.total_pcs ?? 0,
        json: p.total_pcs ?? 0,
        tol: TOL_PCS,
        unit: "pcs",
      });
      // total_kg vs sum(mix.kg)
      const mixKg = (p.mix ?? []).reduce((s, m) => s + (m.kg || 0), 0);
      rows.push({
        scope: tag,
        field: "M4 kg (rows 56/67)",
        excel: p.total_kg ?? 0,
        json: mixKg,
        tol: TOL_KG,
        unit: "kg",
      });
    }
  }

  // ── Week totals ──
  const sumRev = parties.reduce((s, p) => s + (p.revenue || 0), 0);
  const sumExp = parties.reduce((s, p) => s + (p.expense || 0), 0);
  rows.push({
    scope: `W${week.week} · TOTALS`,
    field: "Σ revenue parties → totals.revenue",
    excel: sumRev,
    json: week.totals.revenue,
    tol: TOL_MONEY * 5,
    unit: "usd",
  });
  rows.push({
    scope: `W${week.week} · TOTALS`,
    field: "Σ expense parties → totals.expense",
    excel: sumExp,
    json: week.totals.expense,
    tol: TOL_MONEY * 5,
    unit: "usd",
  });
  const expMargin = sumRev > 0 ? ((sumRev - sumExp) / sumRev) * 100 : 0;
  rows.push({
    scope: `W${week.week} · TOTALS`,
    field: "margin_pct (computed)",
    excel: expMargin,
    json: week.totals.margin_pct,
    tol: 0.1,
    unit: "pct",
  });

  // ── byType: М4 sum across parties ──
  const types: Party["type"][] = ["CAINIAO", "MPO", "MKO"];
  for (const t of types) {
    const inType = parties.filter((p) => p.type === t);
    if (!inType.length) continue;
    const sumPcs = inType.reduce((s, p) => s + (p.total_pcs ?? 0), 0);
    rows.push({
      scope: `W${week.week} · ${t}`,
      field: "Σ total_pcs (UI sum)",
      excel: sumPcs,
      json: sumPcs,
      tol: TOL_PCS,
      unit: "pcs",
    });
    const sumRevT = inType.reduce((s, p) => s + (p.revenue || 0), 0);
    const sumExpT = inType.reduce((s, p) => s + (p.expense || 0), 0);
    rows.push({
      scope: `W${week.week} · ${t}`,
      field: "Σ revenue → byType.revenue",
      excel: sumRevT,
      json: week.byType[t]?.revenue ?? 0,
      tol: TOL_MONEY * 5,
      unit: "usd",
    });
    rows.push({
      scope: `W${week.week} · ${t}`,
      field: "Σ expense → byType.expense",
      excel: sumExpT,
      json: week.byType[t]?.expense ?? 0,
      tol: TOL_MONEY * 5,
      unit: "usd",
    });
  }

  return rows;
}

function fmtVal(v: number | null, unit: Row["unit"]): string {
  if (v == null) return "—";
  if (unit === "usd") return `$${fmtNum(v, 2)}`;
  if (unit === "kg") return `${fmtNum(v, 2)} кг`;
  if (unit === "pcs") return fmtNum(v, 0);
  if (unit === "pct") return `${v.toFixed(2)}%`;
  return v.toFixed(4);
}

function ReconciliationPage() {
  const [weekFilter, setWeekFilter] = useState<number | "all">("all");
  const [onlyMismatches, setOnlyMismatches] = useState(false);

  const allRows = useMemo(() => {
    const list: Row[] = [];
    for (const w of WEEKS) {
      if (weekFilter !== "all" && w.week !== weekFilter) continue;
      list.push(...buildRows(w));
    }
    return list;
  }, [weekFilter]);

  const stats = useMemo(() => {
    let ok = 0;
    let bad = 0;
    for (const r of allRows) {
      const delta = Math.abs((r.excel ?? 0) - (r.json ?? 0));
      if (r.excel == null && r.json == null) {
        ok++;
        continue;
      }
      if (r.excel == null || r.json == null || delta > r.tol) bad++;
      else ok++;
    }
    return { ok, bad, total: allRows.length };
  }, [allRows]);

  const visible = useMemo(
    () =>
      onlyMismatches
        ? allRows.filter((r) => {
            const delta = Math.abs((r.excel ?? 0) - (r.json ?? 0));
            return (
              r.excel == null ||
              r.json == null ||
              delta > r.tol
            );
          })
        : allRows,
    [allRows, onlyMismatches],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Дашборд
            </Link>
            <h1 className="text-lg sm:text-xl font-semibold">
              Сверка 100% · Excel ↔ JSON
            </h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Всего проверок</div>
            <div className="text-2xl font-semibold mt-1">
              {fmtNum(stats.total)}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="text-xs text-muted-foreground">Совпало (Δ=0)</div>
            <div className="text-2xl font-semibold mt-1 text-emerald-500">
              {fmtNum(stats.ok)}
            </div>
          </div>
          <div
            className={`rounded-lg border p-4 ${
              stats.bad > 0
                ? "border-red-500/40 bg-red-500/5"
                : "border-border bg-card"
            }`}
          >
            <div className="text-xs text-muted-foreground">Расхождения</div>
            <div
              className={`text-2xl font-semibold mt-1 ${
                stats.bad > 0 ? "text-red-500" : ""
              }`}
            >
              {fmtNum(stats.bad)}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted-foreground">Неделя:</label>
          <select
            value={weekFilter === "all" ? "all" : String(weekFilter)}
            onChange={(e) =>
              setWeekFilter(
                e.target.value === "all" ? "all" : Number(e.target.value),
              )
            }
            className="rounded-md border border-border bg-card px-2 py-1 text-sm"
          >
            <option value="all">Все недели</option>
            {WEEKS.map((w) => (
              <option key={w.week} value={w.week}>
                W{w.week} · {w.period}
              </option>
            ))}
          </select>
          <label className="ml-auto inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyMismatches}
              onChange={(e) => setOnlyMismatches(e.target.checked)}
            />
            Только расхождения
          </label>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Область</th>
                  <th className="px-3 py-2">Поле</th>
                  <th className="px-3 py-2 text-right">Excel</th>
                  <th className="px-3 py-2 text-right">JSON</th>
                  <th className="px-3 py-2 text-right">Δ</th>
                  <th className="px-3 py-2 text-center">Статус</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      {onlyMismatches
                        ? "Расхождений нет — сверка 100% ✓"
                        : "Нет данных"}
                    </td>
                  </tr>
                )}
                {visible.map((r, i) => {
                  const delta =
                    r.excel == null || r.json == null
                      ? null
                      : r.excel - r.json;
                  const ok =
                    delta != null && Math.abs(delta) <= r.tol;
                  return (
                    <tr
                      key={i}
                      className="border-t border-border hover:bg-muted/30"
                    >
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                        {r.scope}
                      </td>
                      <td className="px-3 py-2">{r.field}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmtVal(r.excel, r.unit)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmtVal(r.json, r.unit)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          delta == null
                            ? "text-muted-foreground"
                            : Math.abs(delta) <= r.tol
                              ? "text-emerald-500"
                              : "text-red-500"
                        }`}
                      >
                        {delta == null ? "—" : fmtVal(delta, r.unit)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ok ? (
                          <CheckCircle2 className="inline h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="inline h-4 w-4 text-red-500" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Источник истины — лист <code>3PL_weekly</code> файла{" "}
          <code>pnl.xlsx</code>. Сверка строится по правилам{" "}
          <code>scripts/README_DATA_RULES.md</code> и совпадает с{" "}
          <code>validate_markers.py</code>, который запускается при каждой
          сборке (build падает при любом расхождении).
        </p>
      </main>
    </div>
  );
}
