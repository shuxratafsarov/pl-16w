# Data Rules — 3PL Weekly Dashboard

**Permanent rules. Apply to EVERY new week without exception.**

## Source of truth

`3PL_weekly` sheet of the workbook (default path `/tmp/pnl.xlsx`, override
with `PNL_XLSX` env var). No other sheet, no manual numbers.

## Row map (1-indexed, sheet `3PL_weekly`)

| Field                    | Row  |
|--------------------------|------|
| Week number (header)     | 6    |
| Party number (header)    | 8    |
| **Revenue** per party    | 10   |
| **Expense** per party    | 94   |
| Linehaul tariff (M1 fb)  | 127  |
| **M1** USD/kg            | 348  |
| **M2** Vol/Net           | 349  |
| **M3** Gross/Net         | 350  |
| MPO pieces               | 59   |
| MKO pieces               | 70   |
| CAINIAO pieces UZ        | 23   |
| CAINIAO pieces BY        | 32   |
| CAINIAO pieces AZ        | 41   |
| CAINIAO pieces KG        | 50   |
| CAINIAO subtype ratios   | 354–374 (see validator) |

Party type detection on row 8: string contains `MPO` → MPO, contains `MKO`
→ MKO, otherwise numeric → CAINIAO.

## JSON conventions in `src/data/week*.json`

1. **`parties[].revenue` / `expense`**: copied from rows 10 / 94 of the
   matching column. No averaging, no rounding beyond cent precision.
2. **`totals.revenue` / `expense`**: must equal `sum(parties[].field)`
   within $5 tolerance.
3. **`totals.margin_pct`** = `(revenue - expense) / revenue * 100`.
4. **Marker 4 (`total_pcs`)**: Stored ONLY on the FIRST party of each type
   (`CAINIAO`, `MPO`, `MKO`); all subsequent parties of the same type get
   `total_pcs: 0`. The UI **sums** across parties, so this layout produces
   the correct group total exactly once.
   - Why: there is no per-party piece count in the source for MPO/MKO; the
     row holds the group total. Storing it on every party would double-count.
5. **M1/M2/M3** copied verbatim per-party from rows 348/349/350. M1 falls
   back to row 127 if 348 is empty.

## UI aggregation rules (must mirror conventions above)

- Markers 1–3: **average** across selected parties.
- Marker 4 (pieces): **sum** across selected parties.
- ProductMix donut: when a party has `total_pcs > sum(party.mix.pcs)`, add
  a synthetic `TOTAL` slice for the diff so the chart total matches M4.

## Validation gate

`npm run build` runs `node scripts/validate-data.mjs` first:
- **Layer 1 (always)**: JS-side invariants on all `week*.json`.
- **Layer 2 (when xlsx present)**: `python3 scripts/validate_markers.py`
  performs row-by-row diff against the workbook. Any mismatch → build fails.

To verify manually:
```bash
npm run validate:data         # both layers if xlsx is at /tmp/pnl.xlsx
PNL_XLSX=/path/to/file.xlsx npm run validate:data
```

## Adding a new week

1. Place workbook at `/tmp/pnl.xlsx` (or set `PNL_XLSX`).
2. Generate / update `src/data/weekN.json` using the row map above.
3. Run `npm run validate:data` — must print
   `✓ All values match 3PL_weekly 100%`.
4. Only then commit. The build will refuse to start otherwise.
