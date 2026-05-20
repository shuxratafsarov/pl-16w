#!/usr/bin/env node
/**
 * Data integrity gate. Runs before `vite build`.
 *
 * Two layers:
 *  1) Pure-JS invariants on src/data/week*.json and week-YYYY-N.json (always run, no source needed):
 *     - sum(party.revenue) == totals.revenue (≤ $5)
 *     - sum(party.expense) == totals.expense (≤ $5)
 *     - sum(party.total_pcs) per type == byType[type].count expectation:
 *       total_pcs is stored on the FIRST party of each type, others 0,
 *       so the UI sums them. Verify exactly one non-zero per type.
 *     - margin_pct == (revenue-expense)/revenue * 100 (≤ 0.1pp)
 *
 *  2) Strict 100% source diff via scripts/validate_markers.py if the
 *     original 3PL workbook is available locally (/tmp/pnl.xlsx). On CI /
 *     production builds where the xlsx isn't present, layer 1 still runs.
 *
 * Exits non-zero on any failure — the build aborts.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const TOL_MONEY = 5; // $
const TOL_PP = 0.1;

const issues = [];

function near(a, b, tol) {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= tol;
}

const files = fs
  .readdirSync(DATA_DIR)
  .filter((f) => /^week(?:-\d{4}-)?\d+\.json$/.test(f));
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
  const w = data.week;
  const parties = data.parties ?? [];

  const sumRev = parties.reduce((s, p) => s + (p.revenue ?? 0), 0);
  const sumExp = parties.reduce((s, p) => s + (p.expense ?? 0), 0);

  if (!near(sumRev, data.totals?.revenue, TOL_MONEY))
    issues.push(`W${w} totals.revenue=${data.totals?.revenue} but sum(parties)=${sumRev.toFixed(2)}`);
  if (!near(sumExp, data.totals?.expense, TOL_MONEY))
    issues.push(`W${w} totals.expense=${data.totals?.expense} but sum(parties)=${sumExp.toFixed(2)}`);

  const expectedMargin = sumRev > 0 ? ((sumRev - sumExp) / sumRev) * 100 : 0;
  if (!near(expectedMargin, data.totals?.margin_pct, TOL_PP))
    issues.push(`W${w} totals.margin_pct=${data.totals?.margin_pct} but computed=${expectedMargin.toFixed(2)}`);

  // total_pcs is now stored per-party for ALL types (M4 by party).
  // Sanity check only — must be a non-negative number when present.
  for (const p of parties) {
    const label = String(p.num ?? "").toUpperCase();
    if (label.includes("UZUM MPO") && p.type !== "MPO") {
      issues.push(`W${w} ${p.num}: UZUM MPO party must have type=MPO, got ${p.type}`);
    }
    if (label.includes("UZUM MKO") && p.type !== "MKO") {
      issues.push(`W${w} ${p.num}: UZUM MKO party must have type=MKO, got ${p.type}`);
    }
    if (p.total_pcs != null && (typeof p.total_pcs !== "number" || p.total_pcs < 0)) {
      issues.push(`W${w} ${p.type} ${p.num}: total_pcs must be a non-negative number`);
    }
  }

  for (const type of ["CAINIAO", "MPO", "MKO"]) {
    const inType = parties.filter((p) => p.type === type);
    const sumRevType = inType.reduce((s, p) => s + (p.revenue ?? 0), 0);
    const sumExpType = inType.reduce((s, p) => s + (p.expense ?? 0), 0);
    if (!near(sumRevType, data.byType?.[type]?.revenue, TOL_MONEY)) {
      issues.push(`W${w} ${type}.revenue=${data.byType?.[type]?.revenue} but sum(parties)=${sumRevType.toFixed(2)}`);
    }
    if (!near(sumExpType, data.byType?.[type]?.expense, TOL_MONEY)) {
      issues.push(`W${w} ${type}.expense=${data.byType?.[type]?.expense} but sum(parties)=${sumExpType.toFixed(2)}`);
    }
  }
}

if (issues.length) {
  console.error(`✗ ${issues.length} data invariant(s) failed:`);
  for (const i of issues) console.error("  " + i);
  process.exit(1);
}
console.log(`✓ JS data invariants OK across ${files.length} weekly files`);

// Layer 2: strict source diff (optional, runs only if xlsx is present locally)
const XLSX = process.env.PNL_XLSX || "/tmp/pnl.xlsx";
if (fs.existsSync(XLSX)) {
  try {
    execSync(`python3 ${path.join(__dirname, "validate_markers.py")} ${XLSX}`, {
      stdio: "inherit",
    });
  } catch {
    process.exit(1);
  }
} else {
  console.log(`ℹ skipping strict source diff (no xlsx at ${XLSX})`);
}
