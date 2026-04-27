"""
Strict data validator for the 3PL weekly dashboard.

Verifies that every value in src/data/week*.json matches the source workbook
3PL_weekly sheet at the row/column level, AND that UI aggregation rules hold
(party sums == group totals == grand totals). Exits non-zero if ANY value
differs by more than the tolerance — the dashboard build MUST run this and
abort on failure.

Usage:  python scripts/validate_markers.py [/path/to/pnl.xlsx]

Source row map (3PL_weekly sheet, 1-indexed):
  Row 6   = week number (column header)
  Row 8   = party number (column header). MPO/MKO are strings like "35 UZUM MKO".
  Row 10  = REVENUE  per party
  Row 94  = EXPENSE  per party
  Row 127 = Linehaul tariff (fallback for M1)
  Row 348 = Marker 1 (USD/kg)
  Row 349 = Marker 2 (Volume/Net ratio)
  Row 350 = Marker 3 (Gross/Net ratio)
  Row 59  = MPO total pieces
  Row 70  = MKO total pieces
  Rows 23/32/41/50 = CAINIAO pieces by country (UZ/BY/AZ/KG)
  Rows 354–374     = CAINIAO subtype ratios (see RATIO_PCS)

Aggregation rules enforced:
  - sum(party.revenue) == totals.revenue
  - sum(party.expense) == totals.expense
  - For Marker 4 (total_pcs) the JSON stores the group total on the FIRST
    party of each type and 0 on the rest, so sum() across parties = group total.
"""
import sys, os, json
import openpyxl

XLSX = sys.argv[1] if len(sys.argv) > 1 else "/tmp/pnl.xlsx"
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "data")
TOL_MONEY = 1.00     # USD tolerance for revenue/expense (rounding)
TOL_RATIO = 0.01     # tolerance for M1/M2/M3
TOL_PCS   = 1        # pieces tolerance

REVENUE_ROW = 10
EXPENSE_ROW = 94
M1_ROW, M2_ROW, M3_ROW = 348, 349, 350
LINEHAUL_TARIFF_ROW = 127
COUNTRY_PCS_ROWS = {"UZ": 23, "BY": 32, "KG": 50, "AZ": 41}
RATIO_PCS = {
    "UZ": [354, 355, 356, 357, 358],
    "BY": [362, 363, 364],
    "KG": [368, 369],
    "AZ": [373, 374],
}
MKO_PCS_ROW, MPO_PCS_ROW = 70, 59


def num(v):
    return v if isinstance(v, (int, float)) else None


def near(a, b, tol):
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return abs(a - b) <= tol


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["3PL_weekly"]
    issues = []

    for week in range(1, 18):
        path = os.path.join(DATA_DIR, f"week{week}.json")
        if not os.path.exists(path):
            continue
        data = json.load(open(path))

        # Build column map for this week
        cols = [c for c in range(5, 257) if ws.cell(6, c).value == week]
        excel_map = {}
        for c in cols:
            num_cell = ws.cell(8, c).value
            if num_cell is None:
                continue
            if isinstance(num_cell, str) and "MPO" in num_cell:
                excel_map[("MPO", num_cell.split()[0])] = c
            elif isinstance(num_cell, str) and "MKO" in num_cell:
                excel_map[("MKO", num_cell.split()[0])] = c
            else:
                excel_map[("CAINIAO", str(num_cell))] = c

        # ---- per-party check ----
        party_rev_sum = 0.0
        party_exp_sum = 0.0
        seen_first_pcs = {"CAINIAO": False, "MPO": False, "MKO": False}
        type_pcs_excel = {"CAINIAO": 0, "MPO": 0, "MKO": 0}
        type_pcs_json  = {"CAINIAO": 0, "MPO": 0, "MKO": 0}

        for p in data["parties"]:
            key = (p["type"], str(p["num"]))
            c = excel_map.get(key)
            if c is None:
                issues.append(f"W{week} {p['type']} {p['num']}: column not found in Excel")
                continue

            # Revenue / Expense
            xr = num(ws.cell(REVENUE_ROW, c).value) or 0.0
            xe = num(ws.cell(EXPENSE_ROW, c).value) or 0.0
            jr = p.get("revenue") or 0.0
            je = p.get("expense") or 0.0
            if not near(xr, jr, TOL_MONEY):
                issues.append(f"W{week} {p['type']} {p['num']} REVENUE excel={xr:.2f} json={jr:.2f}")
            if not near(xe, je, TOL_MONEY):
                issues.append(f"W{week} {p['type']} {p['num']} EXPENSE excel={xe:.2f} json={je:.2f}")
            party_rev_sum += xr
            party_exp_sum += xe

            # M1/M2/M3
            v1 = num(ws.cell(M1_ROW, c).value)
            if v1 is None:
                v1 = num(ws.cell(LINEHAUL_TARIFF_ROW, c).value)
            v2 = num(ws.cell(M2_ROW, c).value)
            v3 = num(ws.cell(M3_ROW, c).value)
            if v1 is not None and not near(v1, p.get("marker1_tariff"), TOL_RATIO):
                issues.append(f"W{week} {p['type']} {p['num']} M1 excel={v1} json={p.get('marker1_tariff')}")
            if v2 is not None and not near(v2, p.get("marker2_volnet"), TOL_RATIO):
                issues.append(f"W{week} {p['type']} {p['num']} M2 excel={v2} json={p.get('marker2_volnet')}")
            if v3 is not None and not near(v3, p.get("marker3_grossnet"), TOL_RATIO):
                issues.append(f"W{week} {p['type']} {p['num']} M3 excel={v3} json={p.get('marker3_grossnet')}")

            # M4 — pieces
            if p["type"] == "CAINIAO":
                xp = 0
                for ct, rows in RATIO_PCS.items():
                    ctot = num(ws.cell(COUNTRY_PCS_ROWS[ct], c).value) or 0
                    for rr in rows:
                        xp += round(ctot * (num(ws.cell(rr, c).value) or 0))
            else:
                row = MKO_PCS_ROW if p["type"] == "MKO" else MPO_PCS_ROW
                xp = int(num(ws.cell(row, c).value) or 0)
            type_pcs_excel[p["type"]] += xp
            type_pcs_json[p["type"]]  += int(p.get("total_pcs") or 0)

        # ---- group totals: sum(party) must equal week totals in JSON ----
        jt = data.get("totals", {})
        if not near(party_rev_sum, jt.get("revenue"), TOL_MONEY * 5):
            issues.append(f"W{week} TOTALS.revenue excel_sum={party_rev_sum:.2f} json={jt.get('revenue')}")
        if not near(party_exp_sum, jt.get("expense"), TOL_MONEY * 5):
            issues.append(f"W{week} TOTALS.expense excel_sum={party_exp_sum:.2f} json={jt.get('expense')}")

        # ---- M4 totals per type (UI sums over parties) must match Excel totals ----
        for t in ("CAINIAO", "MPO", "MKO"):
            if not near(type_pcs_excel[t], type_pcs_json[t], TOL_PCS):
                issues.append(
                    f"W{week} M4 {t} excel_total={type_pcs_excel[t]} "
                    f"json_sum_over_parties={type_pcs_json[t]}"
                )

    if issues:
        print(f"✗ {len(issues)} DISCREPANCIES vs 3PL_weekly:")
        for i in issues:
            print(" ", i)
        sys.exit(1)
    print("✓ All values match 3PL_weekly 100% (M1–M4 + revenue/expense + UI sums)")


if __name__ == "__main__":
    main()
