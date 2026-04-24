import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Party } from "@/lib/types";
import { fmtNum } from "@/lib/format";

type MarkerKey = "marker1_tariff" | "marker2_volnet" | "marker3_grossnet";

type Threshold = {
  /** значение, выше которого — критично */
  critical: number;
  /** значение, выше которого — предупреждение */
  warning: number;
  /** "above" — критично, если значение выше критического; "below" — критично, если ниже */
  direction?: "above" | "below";
  unit?: string;
};

export function MarkerChart({
  parties,
  metric,
  threshold,
  yLabel,
  decimals = 2,
  onBarClick,
}: {
  parties: Party[];
  metric: MarkerKey;
  threshold: Threshold;
  yLabel: string;
  decimals?: number;
  onBarClick?: (col: string) => void;
}) {
  const dir = threshold.direction ?? "above";
  const data = parties
    .filter((p) => typeof p[metric] === "number" && Number.isFinite(p[metric] as number))
    .map((p) => {
      const val = p[metric] as number;
      const critical =
        dir === "above" ? val >= threshold.critical : val <= threshold.critical;
      const warning =
        !critical &&
        (dir === "above" ? val >= threshold.warning : val <= threshold.warning);
      return {
        name: p.num,
        type: p.type,
        col: p.col,
        value: val,
        status: critical ? "critical" : warning ? "warning" : "ok",
      };
    });

  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Данных по этому маркеру для выбранных партий нет
      </div>
    );
  }

  const avg = data.reduce((s, d) => s + d.value, 0) / data.length;

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 80, left: 56, bottom: 28 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="var(--muted-foreground)"
            fontSize={11}
            angle={-30}
            textAnchor="end"
            interval={0}
            height={50}
            tickMargin={6}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickFormatter={(v) => fmtNum(v as number, decimals)}
            width={48}
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              offset: 8,
              fill: "var(--muted-foreground)",
              fontSize: 11,
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            formatter={(v: number) => [`${fmtNum(v, decimals)}${threshold.unit ?? ""}`, "Значение"]}
            labelFormatter={(l, payload) => {
              const t = payload?.[0]?.payload?.type;
              return `Партия ${l}${t ? ` · ${t}` : ""} — клик для деталей`;
            }}
          />
          <ReferenceLine
            y={avg}
            stroke="var(--primary)"
            strokeDasharray="4 4"
            label={{
              value: `средн ${fmtNum(avg, decimals)}`,
              fill: "var(--primary)",
              fontSize: 10,
              position: "right",
              offset: 6,
            }}
          />
          <ReferenceLine
            y={threshold.critical}
            stroke="var(--destructive)"
            strokeDasharray="2 2"
            label={{
              value: `крит ${fmtNum(threshold.critical, decimals)}`,
              fill: "var(--destructive)",
              fontSize: 10,
              position: "right",
              offset: 6,
            }}
          />
          <Bar
            dataKey="value"
            radius={[6, 6, 0, 0]}
            cursor={onBarClick ? "pointer" : undefined}
            onClick={(d: { col?: string }) => {
              if (onBarClick && d?.col) onBarClick(d.col);
            }}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.status === "critical"
                    ? "var(--destructive)"
                    : d.status === "warning"
                    ? "var(--warning)"
                    : "var(--success)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
