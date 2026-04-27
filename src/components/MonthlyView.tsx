import { useMemo, useState } from "react";
import monthly from "@/data/monthly.json";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type MonthRow = {
  month: number;
  month_name: string;
  revenue: number;
  gross_profit: number;
  expense: number;
  margin_pct: number;
  revenue_cainiao: number;
  revenue_uzum_cb: number;
  by_country: {
    UZ_C2M: number;
    BY_C2M: number;
    AZ_C2M: number;
    KG_C2M: number;
    UZ_UZUM_MPO: number;
  };
};

const DATA = monthly as MonthRow[];

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function MonthlyView() {
  const [drill, setDrill] = useState<MonthRow | null>(null);

  const totals = useMemo(() => {
    const r = DATA.reduce((s, m) => s + m.revenue, 0);
    const gp = DATA.reduce((s, m) => s + m.gross_profit, 0);
    return { revenue: r, gp, expense: r - gp, margin: r ? (gp / r) * 100 : 0 };
  }, []);

  const chartData = DATA.map((m) => ({
    name: m.month_name,
    Выручка: m.revenue,
    "Валовая прибыль": m.gross_profit,
    Расходы: m.expense,
    Маржа: m.margin_pct,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Σ Выручка (мес.)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtUSD(totals.revenue)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Σ Расходы</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtUSD(totals.expense)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Σ Валовая прибыль</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtUSD(totals.gp)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Маржа</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtPct(totals.margin)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Помесячная динамика (лист 3PL_monthly)</CardTitle>
          <p className="text-xs text-muted-foreground">Источник: лист «3PL_monthly», строка 10 (Выручка) и строка 290 (Валовая прибыль).</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" />
              <YAxis yAxisId="left" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number, n) => (n === "Маржа" ? fmtPct(v) : fmtUSD(v))} />
              <Legend />
              <Bar yAxisId="left" dataKey="Выручка" fill="hsl(var(--primary))" />
              <Bar yAxisId="left" dataKey="Расходы" fill="hsl(var(--destructive))" opacity={0.6} />
              <Bar yAxisId="left" dataKey="Валовая прибыль" fill="hsl(var(--chart-2, 142 70% 45%))" />
              <Line yAxisId="right" type="monotone" dataKey="Маржа" stroke="hsl(var(--accent-foreground))" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Подробно по месяцам</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Месяц</TableHead>
                <TableHead className="text-right">Выручка</TableHead>
                <TableHead className="text-right">Расходы</TableHead>
                <TableHead className="text-right">Валовая прибыль</TableHead>
                <TableHead className="text-right">Маржа</TableHead>
                <TableHead className="text-right">CAINIAO</TableHead>
                <TableHead className="text-right">UZUM CB</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DATA.map((m) => (
                <TableRow key={m.month} className="cursor-pointer hover:bg-muted/40" onClick={() => setDrill(m)}>
                  <TableCell className="font-medium">{m.month_name}</TableCell>
                  <TableCell className="text-right">{fmtUSD(m.revenue)}</TableCell>
                  <TableCell className="text-right">{fmtUSD(m.expense)}</TableCell>
                  <TableCell className="text-right">{fmtUSD(m.gross_profit)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={m.margin_pct >= 15 ? "default" : m.margin_pct >= 8 ? "secondary" : "destructive"}>
                      {fmtPct(m.margin_pct)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{fmtUSD(m.revenue_cainiao)}</TableCell>
                  <TableCell className="text-right">{fmtUSD(m.revenue_uzum_cb)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">подробнее →</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{drill?.month_name} 2026 — детализация</DialogTitle>
          </DialogHeader>
          {drill && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3"><div className="text-muted-foreground">Выручка</div><div className="text-lg font-semibold">{fmtUSD(drill.revenue)}</div></div>
                <div className="rounded-lg border p-3"><div className="text-muted-foreground">Расходы</div><div className="text-lg font-semibold">{fmtUSD(drill.expense)}</div></div>
                <div className="rounded-lg border p-3"><div className="text-muted-foreground">Валовая прибыль</div><div className="text-lg font-semibold">{fmtUSD(drill.gross_profit)}</div></div>
                <div className="rounded-lg border p-3"><div className="text-muted-foreground">Маржа</div><div className="text-lg font-semibold">{fmtPct(drill.margin_pct)}</div></div>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Выручка по странам / каналам</h4>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[
                    { name: "UZ C2M", value: drill.by_country.UZ_C2M },
                    { name: "BY C2M", value: drill.by_country.BY_C2M },
                    { name: "AZ C2M", value: drill.by_country.AZ_C2M },
                    { name: "KG C2M", value: drill.by_country.KG_C2M },
                    { name: "UZ UZUM MPO", value: drill.by_country.UZ_UZUM_MPO },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmtUSD(v)} />
                    <Bar dataKey="value">
                      {[0,1,2,3,4].map((i) => (<Cell key={i} fill={`hsl(${(i*60)%360} 65% 50%)`} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
