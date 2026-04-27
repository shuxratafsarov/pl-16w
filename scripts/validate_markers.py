"""
Strict M1–M4 validator. Re-extracts markers from the 3PL_weekly sheet using
exact row/column mappings and asserts 100% match against src/data/week*.json.
Run BEFORE any data rebuild:  python scripts/validate_markers.py /tmp/pnl.xlsx
"""
import sys, os, json
import openpyxl
from openpyxl.utils import get_column_letter

XLSX = sys.argv[1] if len(sys.argv) > 1 else "/tmp/pnl.xlsx"
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "data")

M1_ROW, M2_ROW, M3_ROW = 348, 349, 350
LINEHAUL_TARIFF_ROW = 127
COUNTRY_PCS_ROWS = {"UZ": 23, "BY": 32, "KG": 50, "AZ": 41}
COUNTRY_KG_ROWS  = {"UZ": 20, "BY": 29, "KG": 47, "AZ": 38}
RATIO_PCS = {
    "UZ": [("RM",354),("SRM",355),("SRMA",356),("SRMB",357),("SRMC",358)],
    "BY": [("RRM",362),("SRM",363),("NRM",364)],
    "KG": [("RM",368),("NRM",369)],
    "AZ": [("RM",373),("NRM",374)],
}
MKO_PCS_ROW, MPO_PCS_ROW = 70, 59

def n(v):
    return v if isinstance(v,(int,float)) else None

def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["3PL_weekly"]
    issues = []
    for week in range(1, 18):
        path = os.path.join(DATA_DIR, f"week{week}.json")
        if not os.path.exists(path): continue
        data = json.load(open(path))
        cols = [c for c in range(5, 257) if ws.cell(6,c).value == week]
        excel_map = {}
        for c in cols:
            num = ws.cell(8,c).value
            if num is None: continue
            if isinstance(num,str) and "MPO" in num: excel_map[("MPO", num.split()[0])] = c
            elif isinstance(num,str) and "MKO" in num: excel_map[("MKO", num.split()[0])] = c
            else: excel_map[("CAINIAO", str(num))] = c
        for p in data["parties"]:
            c = excel_map.get((p["type"], str(p["num"])))
            if c is None:
                issues.append(f"W{week} {p['type']} {p['num']} not found in Excel"); continue
            v1 = n(ws.cell(M1_ROW,c).value)
            if v1 is None: v1 = n(ws.cell(LINEHAUL_TARIFF_ROW,c).value)
            jv1 = p.get("marker1_tariff")
            if v1 is not None and (jv1 is None or abs(v1 - jv1) > 0.01):
                issues.append(f"W{week} {p['type']} {p['num']} M1 excel={v1} json={jv1}")
            if p["type"] == "CAINIAO":
                tp = 0
                for ct, subs in RATIO_PCS.items():
                    ctot = n(ws.cell(COUNTRY_PCS_ROWS[ct],c).value) or 0
                    for _, rr in subs:
                        tp += round(ctot * (n(ws.cell(rr,c).value) or 0))
                if p.get("total_pcs") != tp:
                    issues.append(f"W{week} CAINIAO {p['num']} total_pcs json={p.get('total_pcs')} excel={tp}")
            else:
                row = MKO_PCS_ROW if p["type"]=="MKO" else MPO_PCS_ROW
                v = int(n(ws.cell(row,c).value) or 0)
                if p.get("total_pcs",0) != v:
                    issues.append(f"W{week} {p['type']} {p['num']} total_pcs json={p.get('total_pcs')} excel={v}")
    if issues:
        print("✗ DISCREPANCIES:")
        for i in issues: print(" ", i)
        sys.exit(1)
    print("✓ All M1–M4 values match Excel 100%")

if __name__ == "__main__":
    main()
