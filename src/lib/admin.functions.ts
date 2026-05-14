import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ===== Password verification =====

function checkPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  if (password.length !== expected.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= password.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => ({ ok: checkPassword(data.password) }));

// ===== Public reads =====

export const listWeeksFromDb = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("weeks")
    .select("week, period, data")
    .order("week", { ascending: true });
  if (error) throw new Error(error.message);
  return { weeks: data ?? [] };
});

export const listMonthlyFromDb = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("monthly")
    .select("month, data")
    .order("month", { ascending: true });
  if (error) throw new Error(error.message);
  return { months: data ?? [] };
});

// ===== Mutations (password-gated) =====

const WeekRowSchema = z.object({
  week: z.number().int().min(1).max(60),
  period: z.string().min(1).max(200),
  data: z.any(),
});

const MonthRowSchema = z.object({
  month: z.number().int().min(1).max(12),
  data: z.any(),
});

export const seedWeeksFromJson = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; weeks: unknown[]; monthly: unknown[] }) =>
    z.object({
      password: z.string().min(1),
      weeks: z.array(WeekRowSchema).max(60),
      monthly: z.array(MonthRowSchema).max(12),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("Неверный пароль");
    if (data.weeks.length) {
      const { error } = await supabaseAdmin.from("weeks").upsert(data.weeks as any, { onConflict: "week" });
      if (error) throw new Error(error.message);
    }
    if (data.monthly.length) {
      const { error } = await supabaseAdmin.from("monthly").upsert(data.monthly as any, { onConflict: "month" });
      if (error) throw new Error(error.message);
    }
    return { ok: true, weeks: data.weeks.length, months: data.monthly.length };
  });

export const upsertWeek = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; week: number; period: string; data: unknown }) =>
    z.object({
      password: z.string().min(1),
      week: z.number().int().min(1).max(60),
      period: z.string().min(1).max(200),
      data: z.any(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("Неверный пароль");
    const { error } = await supabaseAdmin
      .from("weeks")
      .upsert({ week: data.week, period: data.period, data: data.data } as any, { onConflict: "week" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWeek = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; week: number }) =>
    z.object({ password: z.string().min(1), week: z.number().int().min(1).max(60) }).parse(d)
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("Неверный пароль");
    const { error } = await supabaseAdmin.from("weeks").delete().eq("week", data.week);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Excel upload =====

// Row map (1-indexed) — mirrors scripts/validate_markers.py
const ROW = {
  HK: 2,
  WEEK: 6,
  DATE: 7,
  NUM: 8,
  REV: 10,
  EXP: 94,
  LINEHAUL: 127,
  M1: 348, M2: 349, M3: 350,
  MPO_PCS: 59, MPO_KG: 56,
  MKO_PCS: 70, MKO_KG: 67,
  W_GROSS: 322, W_VOL: 324, W_NET: 327,
} as const;

const COUNTRY_PCS = { UZ: 23, BY: 32, AZ: 41, KG: 50 } as const;
const COUNTRY_KG  = { UZ: 20, BY: 29, AZ: 38, KG: 47 } as const;

const SUBTYPES: Record<string, Array<{ row: number; subtype: string }>> = {
  UZ: [
    { row: 354, subtype: "RM" },
    { row: 355, subtype: "SRM" },
    { row: 356, subtype: "SRMA" },
    { row: 357, subtype: "SRMB" },
    { row: 358, subtype: "SRMC" },
  ],
  BY: [
    { row: 362, subtype: "RRM" },
    { row: 363, subtype: "SRM" },
    { row: 364, subtype: "NRM" },
  ],
  KG: [
    { row: 368, subtype: "RM" },
    { row: 369, subtype: "NRM" },
  ],
  AZ: [
    { row: 373, subtype: "RM" },
    { row: 374, subtype: "NRM" },
  ],
};

// Monthly sheet rows (3PL_monthly)
const MONTH_MAP = {
  REV: 10, EXP: 94,
  rev: { UZ: 16, BY: 25, AZ: 34, KG: 43 },
  exp: { UZ: 96, BY: 116, AZ: 161, KG: 196 },
  pcs: { UZ: 23, BY: 32, AZ: 41, KG: 50 },
  kg:  { UZ: 20, BY: 29, AZ: 38, KG: 47 },
} as const;

function cellRef(r: number, c: number) {
  return XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
}
function getNum(ws: XLSX.WorkSheet, r: number, c: number): number | null {
  const cell = ws[cellRef(r, c)];
  if (!cell) return null;
  const v = cell.v;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function getStr(ws: XLSX.WorkSheet, r: number, c: number): string {
  const cell = ws[cellRef(r, c)];
  if (!cell || cell.v == null) return "";
  return String(cell.v);
}
function getDate(ws: XLSX.WorkSheet, r: number, c: number): string | null {
  const cell = ws[cellRef(r, c)];
  if (!cell) return null;
  const v: any = cell.v;
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Excel serial → JS date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${d.y}-${mm}-${dd}`;
  }
  if (typeof v === "string") {
    const m = v.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    const m2 = v.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
    if (m2) return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  }
  return null;
}

function round2(n: number) { return Math.round(n * 100) / 100; }

function detectType(numCell: string): "CAINIAO" | "MPO" | "MKO" {
  if (/MPO/i.test(numCell)) return "MPO";
  if (/MKO/i.test(numCell)) return "MKO";
  return "CAINIAO";
}

function parsePartyNum(numCell: string): string {
  // For "35 UZUM MKO (А)" → "35". For "967" → "967".
  const t = numCell.trim();
  const first = t.split(/\s+/)[0];
  return first;
}

type ParsedWeekResult = {
  week: number;
  period: string;
  data: Record<string, any>;
};

function parseWorkbook(buffer: ArrayBuffer): { weeks: ParsedWeekResult[]; monthly: { month: number; data: any }[] } {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const weeks = parseWeekly(wb);
  const monthly = parseMonthly(wb);
  return { weeks, monthly };
}

function parseWeekly(wb: XLSX.WorkBook): ParsedWeekResult[] {
  const ws = wb.Sheets["3PL_weekly"];
  if (!ws) throw new Error("Лист '3PL_weekly' не найден в файле");
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  const maxCol = range.e.c + 1; // 1-indexed

  // Group columns by week number (row 6)
  const colsByWeek = new Map<number, number[]>();
  for (let c = 5; c <= maxCol; c++) {
    const wn = getNum(ws, ROW.WEEK, c);
    if (wn == null) continue;
    if (!Number.isInteger(wn) || wn < 1 || wn > 60) continue;
    if (!colsByWeek.has(wn)) colsByWeek.set(wn, []);
    colsByWeek.get(wn)!.push(c);
  }

  const out: ParsedWeekResult[] = [];
  const weekNums = [...colsByWeek.keys()].sort((a, b) => a - b);
  for (const week of weekNums) {
    const cols = colsByWeek.get(week)!;
    const colLetter = (c: number) => XLSX.utils.encode_col(c - 1);
    const parties: any[] = [];

    for (const c of cols) {
      const numStr = getStr(ws, ROW.NUM, c).trim();
      if (!numStr) continue;
      const type = detectType(numStr);
      const num = parsePartyNum(numStr);
      const date = getDate(ws, ROW.DATE, c);
      const revenue = getNum(ws, ROW.REV, c) ?? 0;
      const expense = getNum(ws, ROW.EXP, c) ?? 0;
      const gross_profit = round2(revenue - expense);
      const margin_pct = revenue > 0 ? round2((gross_profit / revenue) * 100) : 0;
      const m1 = getNum(ws, ROW.M1, c) ?? getNum(ws, ROW.LINEHAUL, c);
      const m2 = getNum(ws, ROW.M2, c);
      const m3 = getNum(ws, ROW.M3, c);
      const w_net = getNum(ws, ROW.W_NET, c);
      const w_gross = getNum(ws, ROW.W_GROSS, c);
      const w_vol = getNum(ws, ROW.W_VOL, c);
      const hk = /HONGKONG/i.test(getStr(ws, ROW.HK, c));

      const party: any = {
        col: colLetter(c),
        type,
        num,
        date,
        revenue: round2(revenue),
        expense: round2(expense),
        gross_profit,
        margin_pct,
        weight_net: w_net,
        weight_gross: w_gross,
        weight_vol: w_vol,
        marker1_tariff: m1 != null ? round2(m1) : null,
        marker2_volnet: m2 != null ? round2(m2 * 10000) / 10000 : null,
        marker3_grossnet: m3 != null ? round2(m3 * 10000) / 10000 : null,
      };

      if (type === "CAINIAO") {
        const mix: any[] = [];
        let total_pcs = 0;
        for (const country of ["UZ", "BY", "AZ", "KG"] as const) {
          const country_kg = getNum(ws, COUNTRY_KG[country], c) ?? 0;
          const subRows = SUBTYPES[country];
          const subPcs = subRows.map((s) => Math.round(getNum(ws, s.row, c) ?? 0));
          const sumSub = subPcs.reduce((a, b) => a + b, 0);
          for (let i = 0; i < subRows.length; i++) {
            const pcs = subPcs[i];
            if (pcs <= 0) continue;
            const kg = sumSub > 0 ? round2(country_kg * (pcs / sumSub)) : 0;
            mix.push({ country, subtype: subRows[i].subtype, pcs, kg });
          }
          total_pcs += sumSub;
        }
        // Total kg from rows 322 (gross) — UI uses weight_gross as total_kg for CAINIAO
        party.total_kg = w_gross ?? 0;
        party.total_pcs = total_pcs;
        party.mix = mix;
        if (hk) party.is_hk_danger = true;
      } else if (type === "MPO") {
        const total_pcs = Math.round(getNum(ws, ROW.MPO_PCS, c) ?? 0);
        const total_kg = round2(getNum(ws, ROW.MPO_KG, c) ?? 0);
        party.total_pcs = total_pcs;
        party.total_kg = total_kg;
        party.mix = total_pcs > 0 || total_kg > 0
          ? [{ country: "UZ", subtype: "MPO", pcs: total_pcs, kg: total_kg }]
          : [];
        party.is_auto = false;
      } else { // MKO
        const total_pcs = Math.round(getNum(ws, ROW.MKO_PCS, c) ?? 0);
        const total_kg = round2(getNum(ws, ROW.MKO_KG, c) ?? 0);
        party.total_pcs = total_pcs;
        party.total_kg = total_kg;
        party.mix = total_pcs > 0 || total_kg > 0
          ? [{ country: "UZ", subtype: "MKO", pcs: total_pcs, kg: total_kg }]
          : [];
        party.is_auto = /\([АA]\)/.test(numStr);
      }

      parties.push(party);
    }

    if (!parties.length) continue;

    // Aggregates
    const sumByType = (t: string) => {
      const ps = parties.filter((p) => p.type === t);
      const r = ps.reduce((s, p) => s + (p.revenue ?? 0), 0);
      const e = ps.reduce((s, p) => s + (p.expense ?? 0), 0);
      const g = round2(r - e);
      return { count: ps.length, revenue: round2(r), expense: round2(e), gross_profit: g, margin_pct: r > 0 ? round2((g / r) * 100) : 0 };
    };
    const cai = sumByType("CAINIAO");
    const mpo = sumByType("MPO");
    const mko = sumByType("MKO");
    const tRev = round2(cai.revenue + mpo.revenue + mko.revenue);
    const tExp = round2(cai.expense + mpo.expense + mko.expense);
    const tGp = round2(tRev - tExp);
    const uRev = round2(mpo.revenue + mko.revenue);
    const uExp = round2(mpo.expense + mko.expense);
    const uGp = round2(uRev - uExp);

    // Period from min/max date
    const dates = parties.map((p) => p.date).filter((d): d is string => !!d).sort();
    const period = dates.length
      ? `${dates[0]} — ${dates[dates.length - 1]}`
      : `Неделя ${week}`;

    const data = {
      week,
      period,
      totals: { revenue: tRev, expense: tExp, gross_profit: tGp, margin_pct: tRev > 0 ? round2((tGp / tRev) * 100) : 0 },
      byType: { CAINIAO: cai, MPO: mpo, MKO: mko },
      umbrella_uzum_cb: { revenue: uRev, expense: uExp, gross_profit: uGp, margin_pct: uRev > 0 ? round2((uGp / uRev) * 100) : 0 },
      parties,
    };

    out.push({ week, period, data });
  }
  return out;
}

function parseMonthly(wb: XLSX.WorkBook): { month: number; data: any }[] {
  const ws = wb.Sheets["3PL_monthly"];
  if (!ws) return [];
  const out: { month: number; data: any }[] = [];
  const monthNames = ["", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  for (let mo = 1; mo <= 12; mo++) {
    const c = 4 + mo; // col 5..16
    const rev = getNum(ws, MONTH_MAP.REV, c);
    if (rev == null || rev === 0) continue;
    const exp = getNum(ws, MONTH_MAP.EXP, c) ?? 0;
    const by_country: any = {};
    let totalPcs = 0;
    let totalKg = 0;
    for (const cc of ["UZ", "BY", "AZ", "KG"] as const) {
      const cr = getNum(ws, MONTH_MAP.rev[cc], c) ?? 0;
      const ce = getNum(ws, MONTH_MAP.exp[cc], c) ?? 0;
      const cp = Math.round(getNum(ws, MONTH_MAP.pcs[cc], c) ?? 0);
      const ck = getNum(ws, MONTH_MAP.kg[cc], c) ?? 0;
      by_country[cc] = { revenue: round2(cr), expense: round2(ce), pcs: cp, kg: round2(ck) };
      totalPcs += cp;
      totalKg += ck;
    }
    const gp = round2(rev - exp);
    out.push({
      month: mo,
      data: {
        month: mo,
        name: monthNames[mo],
        revenue: round2(rev),
        expense: round2(exp),
        gross_profit: gp,
        margin_pct: rev > 0 ? round2((gp / rev) * 100) : 0,
        by_country,
        pcs: totalPcs,
        kg: round2(totalKg),
      },
    });
  }
  return out;
}

export const uploadExcel = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; fileBase64: string; replaceAll?: boolean }) =>
    z.object({
      password: z.string().min(1),
      fileBase64: z.string().min(10),
      replaceAll: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("Неверный пароль");

    // Decode base64 → ArrayBuffer
    const bin = atob(data.fileBase64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);

    let parsed;
    try {
      parsed = parseWorkbook(buf.buffer);
    } catch (e: any) {
      throw new Error("Не удалось разобрать Excel: " + (e?.message ?? String(e)));
    }

    if (data.replaceAll) {
      const { error: dErr } = await supabaseAdmin.from("weeks").delete().gt("week", 0);
      if (dErr) throw new Error(dErr.message);
      const { error: dmErr } = await supabaseAdmin.from("monthly").delete().gt("month", 0);
      if (dmErr) throw new Error(dmErr.message);
    }

    if (parsed.weeks.length) {
      const { error } = await supabaseAdmin.from("weeks").upsert(parsed.weeks as any, { onConflict: "week" });
      if (error) throw new Error(error.message);
    }
    if (parsed.monthly.length) {
      const { error } = await supabaseAdmin.from("monthly").upsert(parsed.monthly as any, { onConflict: "month" });
      if (error) throw new Error(error.message);
    }

    return {
      ok: true,
      weeksParsed: parsed.weeks.length,
      monthsParsed: parsed.monthly.length,
      weekNumbers: parsed.weeks.map((w) => w.week),
    };
  });
