/**
 * Фиксированные базовые («целевые») значения маркеров и критические пороги.
 * Применяются везде в UI: подсветка статусов, ReferenceLine "среднее", блок MiniStat "Среднее" и т.д.
 *
 * Если для маркера базовое значение задано — оно используется как средняя точка.
 * Партии выше базового → "warning" (жёлтый), выше критического → "critical" (красный).
 * Для маркеров без базового используется среднее по выборке (старое поведение).
 */
export type BaselineMarkerKey =
  | "marker1_tariff"
  | "marker2_volnet"
  | "marker3_grossnet"
  | "marker4_margin";

export const MARKER_BASELINE: Partial<Record<BaselineMarkerKey, number>> = {
  marker2_volnet: 1.35,
  marker3_grossnet: 1.05,
};

export const MARKER_CRITICAL: Partial<Record<BaselineMarkerKey, number>> = {
  marker2_volnet: 1.62,
  marker3_grossnet: 1.26,
};

/** Пороги для фронта: возвращает фиксированные значения, если есть baseline; иначе считает от sampleAvg. */
export function getMarkerThresholds(
  metric: string,
  sampleAvg: number,
  warnPct = 0.1,
  critPct = 0.2,
  direction: "above" | "below" = "above"
): { avg: number; warn: number; crit: number; isFixed: boolean } {
  const baseline = MARKER_BASELINE[metric as BaselineMarkerKey];
  const critical = MARKER_CRITICAL[metric as BaselineMarkerKey];
  if (typeof baseline === "number") {
    return {
      avg: baseline,
      warn: baseline,
      crit: typeof critical === "number" ? critical : baseline * (1 + critPct),
      isFixed: true,
    };
  }
  if (direction === "above") {
    return {
      avg: sampleAvg,
      warn: sampleAvg * (1 + warnPct),
      crit: sampleAvg * (1 + critPct),
      isFixed: false,
    };
  }
  return {
    avg: sampleAvg,
    warn: sampleAvg * (1 - warnPct),
    crit: sampleAvg * (1 - critPct),
    isFixed: false,
  };
}

/** Универсальный статус: выше warn → warning, выше crit → critical (для direction="above"). */
export function statusFromThresholds(
  value: number,
  warn: number,
  crit: number,
  direction: "above" | "below" = "above"
): "ok" | "warning" | "critical" {
  if (direction === "above") {
    if (value > crit) return "critical";
    if (value > warn) return "warning";
    return "ok";
  }
  if (value < crit) return "critical";
  if (value < warn) return "warning";
  return "ok";
}
